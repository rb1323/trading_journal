using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace TradingJournal.DasSync;

internal sealed record PairResponse(string DeviceId, string SourceId, string Token);

internal sealed class SyncApiClient : IDisposable
{
    private readonly HttpClient _client;

    public SyncApiClient(string baseUrl, string? token = null)
    {
        _client = new HttpClient { BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/"), Timeout = TimeSpan.FromSeconds(30) };
        if (!string.IsNullOrWhiteSpace(token)) _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    public async Task<PairResponse> PairAsync(string code, string deviceName, string version, CancellationToken cancellationToken)
    {
        using var response = await _client.PostAsJsonAsync("api/devices/pair", new { code, deviceName, version }, cancellationToken);
        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(ReadError(text, response.StatusCode.ToString()));
        return JsonSerializer.Deserialize<PairResponse>(text, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
               ?? throw new InvalidOperationException("Palvelimen paritusvastaus oli virheellinen.");
    }

    public async Task UploadAsync(PendingSnapshot snapshot, string sourceId, CancellationToken cancellationToken)
    {
        using var form = new MultipartFormDataContent();
        using var content = new ByteArrayContent(snapshot.Content);
        content.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        form.Add(content, "file", snapshot.FileName);
        form.Add(new StringContent(sourceId), "sourceId");
        form.Add(new StringContent(snapshot.Sha256), "sha256");
        form.Add(new StringContent(snapshot.LastModifiedUtc.ToUniversalTime().ToString("O")), "lastModifiedUtc");
        using var response = await _client.PostAsync("api/sync/snapshots", form, cancellationToken);
        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(ReadError(text, response.StatusCode.ToString()));
    }

    public async Task HeartbeatAsync(string version, object state, CancellationToken cancellationToken)
    {
        using var response = await _client.PostAsJsonAsync("api/devices/heartbeat", new { version, state }, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var text = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException(ReadError(text, response.StatusCode.ToString()));
        }
    }

    private static string ReadError(string json, string fallback)
    {
        try { return JsonDocument.Parse(json).RootElement.GetProperty("error").GetString() ?? fallback; }
        catch { return string.IsNullOrWhiteSpace(json) ? fallback : json; }
    }

    public void Dispose() => _client.Dispose();
}
