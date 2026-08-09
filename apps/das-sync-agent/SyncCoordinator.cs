namespace TradingJournal.DasSync;

internal enum SyncState { Connected, Syncing, Offline, Error }

internal sealed record AgentStatus(
    SyncState State,
    string? LastFile,
    DateTimeOffset? LastSuccess,
    int PendingUploads,
    string? Error);

internal sealed class SyncCoordinator : IDisposable
{
    private readonly OutboxRepository _outbox;
    private readonly SemaphoreSlim _scanLock = new(1, 1);
    private readonly SemaphoreSlim _uploadLock = new(1, 1);
    private readonly CancellationTokenSource _shutdown = new();
    private readonly System.Threading.Timer _pollTimer;
    private readonly System.Threading.Timer _outboxTimer;
    private readonly System.Threading.Timer _heartbeatTimer;
    private FileSystemWatcher? _watcher;
    private AgentConfig _config;
    private DateTimeOffset _lastEvent = DateTimeOffset.MinValue;
    private string? _lastFile;
    private DateTimeOffset? _lastSuccess;
    private string? _lastError;

    public event Action<AgentStatus>? StatusChanged;

    public SyncCoordinator(AgentConfig config)
    {
        _config = config;
        _outbox = new OutboxRepository();
        _pollTimer = new System.Threading.Timer(_ => _ = ScanAsync(false), null, Timeout.Infinite, Timeout.Infinite);
        _outboxTimer = new System.Threading.Timer(_ => _ = ProcessOutboxAsync(), null, Timeout.Infinite, Timeout.Infinite);
        _heartbeatTimer = new System.Threading.Timer(_ => _ = HeartbeatAsync(), null, Timeout.Infinite, Timeout.Infinite);
        ConfigureWatcher();
        _pollTimer.Change(TimeSpan.Zero, TimeSpan.FromSeconds(30));
        _outboxTimer.Change(TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(2));
        _heartbeatTimer.Change(TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(60));
    }

    public void UpdateConfig(AgentConfig config)
    {
        _config = config;
        ConfigureWatcher();
        _ = ScanAsync(true);
    }

    public Task RescanAsync() => ScanAsync(true);

    private void ConfigureWatcher()
    {
        _watcher?.Dispose();
        _watcher = null;
        if (string.IsNullOrWhiteSpace(_config.ExportFolder) || !Directory.Exists(_config.ExportFolder))
        {
            Publish(SyncState.Error, "Export-hakemistoa ei ole valittu tai sitä ei löydy.");
            return;
        }

        _watcher = new FileSystemWatcher(_config.ExportFolder, "Trades*.csv")
        {
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
            IncludeSubdirectories = false,
            EnableRaisingEvents = true
        };
        _watcher.Changed += OnFileChanged;
        _watcher.Created += OnFileChanged;
        _watcher.Renamed += OnFileChanged;
        _watcher.Error += (_, args) => Publish(SyncState.Error, args.GetException().Message);
    }

    private void OnFileChanged(object sender, FileSystemEventArgs args)
    {
        _lastEvent = DateTimeOffset.UtcNow;
        _ = DebouncedScanAsync();
    }

    private async Task DebouncedScanAsync()
    {
        await Task.Delay(TimeSpan.FromSeconds(2), _shutdown.Token).ConfigureAwait(false);
        if (DateTimeOffset.UtcNow - _lastEvent >= TimeSpan.FromSeconds(1.8)) await ScanAsync(false).ConfigureAwait(false);
    }

    private async Task ScanAsync(bool force)
    {
        if (!_config.IsPaired || !Directory.Exists(_config.ExportFolder) || !await _scanLock.WaitAsync(0, _shutdown.Token).ConfigureAwait(false)) return;
        try
        {
            var files = Directory.EnumerateFiles(_config.ExportFolder, "Trades*.csv")
                .OrderBy(File.GetLastWriteTimeUtc)
                .ToArray();
            foreach (var file in files)
            {
                var stable = await FileStabilityReader.TryReadAsync(file, _shutdown.Token).ConfigureAwait(false);
                if (stable is null) continue;
                _lastFile = stable.Name;
                if (_outbox.Enqueue(stable.Name, stable.Content, stable.Sha256, stable.LastModifiedUtc) || force)
                    Publish(SyncState.Syncing, null);
            }
            await ProcessOutboxAsync().ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (_shutdown.IsCancellationRequested) { }
        catch (Exception exception)
        {
            _lastError = exception.Message;
            Publish(SyncState.Error, exception.Message);
        }
        finally { _scanLock.Release(); }
    }

    private async Task ProcessOutboxAsync()
    {
        if (!await _uploadLock.WaitAsync(0, _shutdown.Token).ConfigureAwait(false)) return;
        try
        {
            using var api = new SyncApiClient(_config.ApiBaseUrl, _config.GetToken());
            while (!_shutdown.IsCancellationRequested)
            {
                var pending = _outbox.GetNextDue();
                if (pending is null) break;
                try
                {
                    Publish(SyncState.Syncing, null);
                    await api.UploadAsync(pending, _config.SourceId, _shutdown.Token).ConfigureAwait(false);
                    _outbox.MarkSent(pending.Id);
                    _lastSuccess = DateTimeOffset.UtcNow;
                    _lastError = null;
                    Archive(pending);
                }
                catch (Exception exception)
                {
                    _outbox.MarkFailed(pending.Id, pending.AttemptCount, exception.Message);
                    _lastError = exception.Message;
                    Publish(SyncState.Offline, exception.Message);
                    break;
                }
            }
            if (_outbox.PendingCount() == 0) Publish(SyncState.Connected, null);
        }
        finally { _uploadLock.Release(); }
    }

    private void Archive(PendingSnapshot snapshot)
    {
        var date = snapshot.LastModifiedUtc.ToLocalTime().ToString("yyyy-MM-dd");
        var folder = Path.Combine(AppPaths.Archive, date);
        Directory.CreateDirectory(folder);
        var target = Path.Combine(folder, "Trades.csv");
        File.WriteAllBytes(target + ".tmp", snapshot.Content);
        File.Move(target + ".tmp", target, true);
    }

    private async Task HeartbeatAsync()
    {
        if (!_config.IsPaired) return;
        try
        {
            using var api = new SyncApiClient(_config.ApiBaseUrl, _config.GetToken());
            await api.HeartbeatAsync(Application.ProductVersion, new
            {
                exportFolder = _config.ExportFolder,
                pendingUploads = _outbox.PendingCount(),
                status = _lastError is null ? "connected" : "degraded",
                lastFile = _lastFile,
                lastSuccess = _lastSuccess
            }, _shutdown.Token).ConfigureAwait(false);
            await ProcessOutboxAsync().ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (_shutdown.IsCancellationRequested) { }
        catch (Exception exception)
        {
            _lastError = exception.Message;
            Publish(SyncState.Offline, exception.Message);
        }
    }

    private void Publish(SyncState state, string? error)
    {
        StatusChanged?.Invoke(new AgentStatus(state, _lastFile, _lastSuccess, _outbox.PendingCount(), error));
    }

    public void Dispose()
    {
        _shutdown.Cancel();
        _watcher?.Dispose();
        _pollTimer.Dispose();
        _outboxTimer.Dispose();
        _heartbeatTimer.Dispose();
        _scanLock.Dispose();
        _uploadLock.Dispose();
        _shutdown.Dispose();
    }
}
