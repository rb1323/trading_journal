namespace TradingJournal.DasSync;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Directory.CreateDirectory(AppPaths.Root);
        using var mutex = new Mutex(true, "TradingJournal.DasSync.SingleInstance", out var firstInstance);
        if (!firstInstance)
        {
            MessageBox.Show("DAS Sync on jo käynnissä.", "Northstar Journal", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        Application.Run(new TrayApplicationContext());
    }
}

