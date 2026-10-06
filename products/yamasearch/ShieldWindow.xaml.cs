using System.Windows;

namespace YamaSearch;
public partial class ShieldWindow : Window
{
    private readonly SettingsStore _settings;
    public ShieldWindow(SettingsStore settings, string? url)
    {
        InitializeComponent(); _settings = settings;
        PageState.Text = url is not null && Uri.TryCreate(url, UriKind.Absolute, out var page)
            ? (page.Scheme == "https" ? "Tato stránka používá šifrované HTTPS připojení." : "Pozor: toto připojení není šifrované (HTTP).")
            : "Stav stránky bude dostupný po načtení webu.";
        Recommended.IsChecked = settings.Data.SecurityLevel == SecurityLevel.Recommended;
        Strict.IsChecked = settings.Data.SecurityLevel == SecurityLevel.Strict;
        Custom.IsChecked = settings.Data.SecurityLevel == SecurityLevel.Custom;
        SmartScreen.IsChecked = settings.Data.EnableSmartScreen; PasswordSave.IsChecked = settings.Data.OfferPasswordSave;
    }
    private void Level_Checked(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded) return;
        if (Recommended.IsChecked == true) { SmartScreen.IsChecked = true; }
        if (Strict.IsChecked == true) { SmartScreen.IsChecked = true; }
    }
    private void Save_Click(object sender, RoutedEventArgs e)
    {
        _settings.Data.SecurityLevel = Recommended.IsChecked == true ? SecurityLevel.Recommended : Strict.IsChecked == true ? SecurityLevel.Strict : SecurityLevel.Custom;
        _settings.Data.EnableSmartScreen = SmartScreen.IsChecked == true;
        _settings.Data.OfferPasswordSave = PasswordSave.IsChecked == true;
        DialogResult = true;
    }
    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
