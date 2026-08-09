using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace TradingJournal.DasSync;

internal sealed record AgentConfig
{
    public string ApiBaseUrl { get; init; } = "";
    public string DeviceId { get; init; } = "";
    public string SourceId { get; init; } = "";
    public string ProtectedToken { get; init; } = "";
    public string ExportFolder { get; init; } = "";
    public bool StartWithWindows { get; init; }

    public bool IsPaired => Uri.TryCreate(ApiBaseUrl, UriKind.Absolute, out _) &&
                            !string.IsNullOrWhiteSpace(DeviceId) &&
                            !string.IsNullOrWhiteSpace(SourceId) &&
                            !string.IsNullOrWhiteSpace(ProtectedToken);

    public string GetToken()
    {
        if (string.IsNullOrWhiteSpace(ProtectedToken)) return "";
        var protectedBytes = Convert.FromBase64String(ProtectedToken);
        var bytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
        return Encoding.UTF8.GetString(bytes);
    }

    public static string ProtectToken(string token)
    {
        var bytes = Encoding.UTF8.GetBytes(token);
        return Convert.ToBase64String(ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser));
    }
}

internal static class ConfigStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static AgentConfig Load()
    {
        try
        {
            return File.Exists(AppPaths.Config)
                ? JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(AppPaths.Config), JsonOptions) ?? new AgentConfig()
                : new AgentConfig();
        }
        catch
        {
            return new AgentConfig();
        }
    }

    public static void Save(AgentConfig config)
    {
        Directory.CreateDirectory(AppPaths.Root);
        var temporary = AppPaths.Config + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(config, JsonOptions));
        File.Move(temporary, AppPaths.Config, true);
    }
}

