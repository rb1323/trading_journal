namespace TradingJournal.DasSync;

internal sealed class TrayApplicationContext : ApplicationContext
{
    private readonly SynchronizationContext _uiContext =
        SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
    private readonly NotifyIcon _icon;
    private readonly ToolStripMenuItem _statusItem;
    private readonly ToolStripMenuItem _autoStartItem;
    private AgentConfig _config;
    private SyncCoordinator? _coordinator;

    public TrayApplicationContext()
    {
        _config = ConfigStore.Load();
        _statusItem = new ToolStripMenuItem("Ei yhdistetty") { Enabled = false };
        _autoStartItem = new ToolStripMenuItem("Käynnistä Windowsin mukana") { Checked = AutoStartManager.IsEnabled(), CheckOnClick = true };
        _autoStartItem.CheckedChanged += (_, _) => ToggleAutoStart();
        var menu = new ContextMenuStrip();
        menu.Items.Add(_statusItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Avaa journal", null, (_, _) => OpenJournal());
        menu.Items.Add("Skannaa uudelleen", null, async (_, _) => await (_coordinator?.RescanAsync() ?? Task.CompletedTask));
        menu.Items.Add("Vaihda export-hakemisto", null, (_, _) => ChooseFolder());
        menu.Items.Add(_autoStartItem);
        menu.Items.Add("Katkaise yhteys", null, (_, _) => Disconnect());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Lopeta", null, (_, _) => ExitThread());
        _icon = new NotifyIcon { Icon = SystemIcons.Application, Text = "Northstar DAS Sync", ContextMenuStrip = menu, Visible = true };
        _icon.DoubleClick += (_, _) => OpenJournal();

        if (!_config.IsPaired) Pair();
        if (_config.IsPaired && string.IsNullOrWhiteSpace(_config.ExportFolder)) ChooseFolder();
        StartCoordinator();
    }

    private void Pair()
    {
        using var dialog = new PairingDialog(_config.ApiBaseUrl);
        if (dialog.ShowDialog() != DialogResult.OK) return;
        try
        {
            using var api = new SyncApiClient(dialog.ApiBaseUrl);
            var response = api.PairAsync(dialog.PairingCode, Environment.MachineName, Application.ProductVersion, CancellationToken.None).GetAwaiter().GetResult();
            _config = _config with
            {
                ApiBaseUrl = dialog.ApiBaseUrl.TrimEnd('/'),
                DeviceId = response.DeviceId,
                SourceId = response.SourceId,
                ProtectedToken = AgentConfig.ProtectToken(response.Token)
            };
            ConfigStore.Save(_config);
            MessageBox.Show("DAS Sync yhdistettiin onnistuneesti.", "Northstar Journal", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception exception)
        {
            MessageBox.Show(exception.Message, "Paritus epäonnistui", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ChooseFolder()
    {
        using var dialog = new FolderBrowserDialog { Description = "Valitse DAS Traderin auto-export-hakemisto", UseDescriptionForTitle = true, SelectedPath = _config.ExportFolder };
        if (dialog.ShowDialog() != DialogResult.OK) return;
        _config = _config with { ExportFolder = dialog.SelectedPath };
        ConfigStore.Save(_config);
        _coordinator?.UpdateConfig(_config);
    }

    private void StartCoordinator()
    {
        if (!_config.IsPaired) { _statusItem.Text = "Ei yhdistetty"; return; }
        _coordinator?.Dispose();
        _coordinator = new SyncCoordinator(_config);
        _coordinator.StatusChanged += status =>
            _uiContext.Post(_ => UpdateStatus(status), null);
        _ = _coordinator.RescanAsync();
    }

    private void UpdateStatus(AgentStatus status)
    {
        _statusItem.Text = status.State switch
        {
            SyncState.Connected => $"Yhdistetty · jonossa {status.PendingUploads}",
            SyncState.Syncing => $"Synkronoidaan · jonossa {status.PendingUploads}",
            SyncState.Offline => $"Offline · jonossa {status.PendingUploads}",
            _ => $"Virhe · {status.Error}"
        };
        _icon.Text = _statusItem.Text.Length > 63 ? _statusItem.Text[..63] : _statusItem.Text;
    }

    private void OpenJournal()
    {
        if (!_config.IsPaired) { Pair(); StartCoordinator(); return; }
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(_config.ApiBaseUrl + "/trades") { UseShellExecute = true });
    }

    private void ToggleAutoStart()
    {
        AutoStartManager.SetEnabled(_autoStartItem.Checked);
        _config = _config with { StartWithWindows = _autoStartItem.Checked };
        ConfigStore.Save(_config);
    }

    private void Disconnect()
    {
        if (MessageBox.Show("Katkaistaanko tämän agentin paikallinen yhteys? Peruuta laite myös web-sovelluksessa.", "Katkaise yhteys", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        _coordinator?.Dispose();
        _coordinator = null;
        _config = new AgentConfig { ApiBaseUrl = _config.ApiBaseUrl, ExportFolder = _config.ExportFolder };
        ConfigStore.Save(_config);
        _statusItem.Text = "Ei yhdistetty";
    }

    protected override void ExitThreadCore()
    {
        _coordinator?.Dispose();
        _icon.Visible = false;
        _icon.Dispose();
        base.ExitThreadCore();
    }
}
