namespace TradingJournal.DasSync;

internal sealed class PairingDialog : Form
{
    private readonly TextBox _url = new() { Dock = DockStyle.Top, PlaceholderText = "https://journal.example.com" };
    private readonly TextBox _code = new() { Dock = DockStyle.Top, PlaceholderText = "123456", MaxLength = 6 };
    public string ApiBaseUrl => _url.Text.Trim();
    public string PairingCode => _code.Text.Trim();

    public PairingDialog(string existingUrl)
    {
        Text = "Yhdistä Northstar Journal";
        Width = 430;
        Height = 245;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        _url.Text = existingUrl;
        var button = new Button { Text = "Yhdistä", Dock = DockStyle.Bottom, Height = 38, DialogResult = DialogResult.OK };
        AcceptButton = button;
        Controls.Add(button);
        Controls.Add(new Label { Text = "Parituskoodi", Dock = DockStyle.Top, Height = 27, Padding = new Padding(0, 8, 0, 0) });
        Controls.Add(_code);
        Controls.Add(new Label { Text = "Journalin osoite", Dock = DockStyle.Top, Height = 27, Padding = new Padding(0, 8, 0, 0) });
        Controls.Add(_url);
        Padding = new Padding(18);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (DialogResult == DialogResult.OK && (!Uri.TryCreate(ApiBaseUrl, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps && uri.Host != "localhost" || !System.Text.RegularExpressions.Regex.IsMatch(PairingCode, "^\\d{6}$")))
        {
            MessageBox.Show("Anna kelvollinen HTTPS-osoite ja kuusinumeroinen parituskoodi.", "Virhe", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            e.Cancel = true;
        }
        base.OnFormClosing(e);
    }
}

