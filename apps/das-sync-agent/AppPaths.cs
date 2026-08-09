namespace TradingJournal.DasSync;

internal static class AppPaths
{
    public static readonly string Root = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "TradingJournal");
    public static readonly string Config = Path.Combine(Root, "agent.json");
    public static readonly string Outbox = Path.Combine(Root, "outbox.db");
    public static readonly string Archive = Path.Combine(Root, "archive");
}

