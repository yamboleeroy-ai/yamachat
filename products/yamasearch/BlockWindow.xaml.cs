using System.Windows;

namespace YamaSearch;

public partial class BlockWindow : Window
{
    private readonly SettingsStore _settings;
    private readonly string? _currentHost;

    public BlockWindow(SettingsStore settings, string? url)
    {
        InitializeComponent();
        _settings = settings;

        if (Uri.TryCreate(url, UriKind.Absolute, out var page) && page.Scheme is "http" or "https")
        {
            _currentHost = page.Host;
            PageState.Text = $"Nastavení pro aktuální stránku: {_currentHost}";
            CurrentHostText.Text = _currentHost;
            AllowCurrentSite.IsChecked = IsWhitelisted(_currentHost);
        }
        else
        {
            PageState.Text = "Nastavení se použije pro všechny stránky.";
            CurrentHostText.Text = "Aktuální web není k dispozici.";
            AllowCurrentSite.IsEnabled = false;
        }

        Off.IsChecked = settings.Data.BlockMode == BlockMode.Off;
        Standard.IsChecked = settings.Data.BlockMode == BlockMode.Standard;
        Strict.IsChecked = settings.Data.BlockMode == BlockMode.Strict;

        YouTubeEnhanced.IsChecked = settings.Data.EnableYouTubeAdBlock;
        CosmeticBlocking.IsChecked = settings.Data.EnableCosmeticBlocking;
        TrackerBlocking.IsChecked = settings.Data.EnableTrackerBlocking;
    }

    private bool IsWhitelisted(string host)
        => _settings.Data.Whitelist.Any(x =>
            host.Equals(x, StringComparison.OrdinalIgnoreCase)
            || host.EndsWith("." + x, StringComparison.OrdinalIgnoreCase));

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        _settings.Data.BlockMode = Off.IsChecked == true
            ? BlockMode.Off
            : Strict.IsChecked == true
                ? BlockMode.Strict
                : BlockMode.Standard;

        _settings.Data.EnableYouTubeAdBlock = YouTubeEnhanced.IsChecked == true;
        _settings.Data.EnableCosmeticBlocking = CosmeticBlocking.IsChecked == true;
        _settings.Data.EnableTrackerBlocking = TrackerBlocking.IsChecked == true;

        if (!string.IsNullOrWhiteSpace(_currentHost))
        {
            _settings.Data.Whitelist.RemoveAll(x =>
                string.Equals(x, _currentHost, StringComparison.OrdinalIgnoreCase));

            if (AllowCurrentSite.IsChecked == true)
                _settings.Data.Whitelist.Add(_currentHost);
        }

        DialogResult = true;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
