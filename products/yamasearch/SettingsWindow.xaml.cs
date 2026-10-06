using Microsoft.Web.WebView2.Core;
using System.Windows;
using System.Windows.Controls;

namespace YamaSearch;

public partial class SettingsWindow : Window
{
    private readonly SettingsStore _settings;
    private readonly CoreWebView2Profile? _profile;
    private readonly bool _originalHardwareAcceleration;

    public bool RestartRequired { get; private set; }

    public SettingsWindow(SettingsStore settings, CoreWebView2Profile? profile)
    {
        InitializeComponent();
        _settings = settings;
        _profile = profile;
        _originalHardwareAcceleration = settings.Data.HardwareAccelerationEnabled;

        SearchEngine.SelectedIndex = new[] { "Google", "Seznam", "Bing", "DuckDuckGo", "Brave Search", "Ecosia", "Yahoo", "Startpage" }
            .ToList().IndexOf(settings.Data.SearchEngine);
        if (SearchEngine.SelectedIndex < 0) SearchEngine.SelectedIndex = 3;

        HomePage.SelectedIndex = settings.Data.HomePage switch
        {
            "yamasearch://newtab" => 0,
            "https://www.google.com/" => 1,
            "https://search.seznam.cz/" => 2,
            _ => 3
        };

        if (HomePage.SelectedIndex == 3)
            CustomHome.Text = settings.Data.HomePage;

        OfferPasswordSave.IsChecked = settings.Data.OfferPasswordSave;
        HardwareAcceleration.IsChecked = settings.Data.HardwareAccelerationEnabled;
    }

    private async void DeletePasswords_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Opravdu smazat všechna uložená hesla? Akce je nevratná.", "YamaSearch", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
            return;

        if (_profile == null)
        {
            MessageBox.Show("Webový profil zatím není připraven.", "YamaSearch");
            return;
        }

        try
        {
            await _profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.PasswordAutosave);
            MessageBox.Show("Uložená hesla byla smazána.", "YamaSearch");
        }
        catch (Exception error)
        {
            MessageBox.Show("Hesla se nepodařilo smazat: " + error.Message, "YamaSearch");
        }
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        _settings.Data.SearchEngine = ((ComboBoxItem)SearchEngine.SelectedItem).Content.ToString()!;
        _settings.Data.HomePage = HomePage.SelectedIndex switch
        {
            0 => "yamasearch://newtab",
            1 => "https://www.google.com/",
            2 => "https://search.seznam.cz/",
            _ => CustomHome.Text.Trim()
        };

        if (HomePage.SelectedIndex == 3
            && (!Uri.TryCreate(_settings.Data.HomePage, UriKind.Absolute, out var uri)
                || (uri.Scheme != "https" && uri.Scheme != "http")))
        {
            MessageBox.Show("Vlastní domovská stránka musí být platná HTTP(S) adresa.", "YamaSearch");
            return;
        }

        _settings.Data.OfferPasswordSave = OfferPasswordSave.IsChecked == true;
        _settings.Data.HardwareAccelerationEnabled = HardwareAcceleration.IsChecked == true;
        RestartRequired = _settings.Data.HardwareAccelerationEnabled != _originalHardwareAcceleration;
        DialogResult = true;
    }

    private void Close_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
