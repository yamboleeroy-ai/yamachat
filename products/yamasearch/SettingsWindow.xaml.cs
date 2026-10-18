using Microsoft.Web.WebView2.Core;
using System.Windows;
using System.Windows.Input;
using System.Windows.Controls;

namespace YamaSearch;

public partial class SettingsWindow : Window
{
    private readonly SettingsStore _settings;
    private readonly CoreWebView2Profile? _profile;
    private readonly AccountService _accounts;
    private readonly bool _privateWindow;
    private readonly bool _originalHardwareAcceleration;
    private readonly CancellationTokenSource _lifetime = new();
    private int _avatarVersion;

    public bool RestartRequired { get; private set; }

    public SettingsWindow(SettingsStore settings, CoreWebView2Profile? profile, AccountService accounts, bool privateWindow)
    {
        InitializeComponent();
        _settings = settings;
        _profile = profile;
        _accounts = accounts;
        _privateWindow = privateWindow;
        _originalHardwareAcceleration = settings.Data.HardwareAccelerationEnabled;
        _accounts.StateChanged += Accounts_StateChanged;
        Closed += (_, _) =>
        {
            _accounts.StateChanged -= Accounts_StateChanged;
            _lifetime.Cancel();
            _lifetime.Dispose();
        };

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
        EnableGeneralAutofill.IsChecked = settings.Data.EnableGeneralAutofill;
        HardwareAcceleration.IsChecked = settings.Data.HardwareAccelerationEnabled;
        BlockNewNotificationRequests.IsChecked = settings.Data.BlockNewNotificationRequests;
        EnableNativeNotifications.IsChecked = settings.Data.EnableNativeNotifications;
        EnableNotificationSound.IsChecked = settings.Data.EnableNotificationSound;
        EnableTabNotificationIndicators.IsChecked = settings.Data.EnableTabNotificationIndicators;
        RenderAccountSummary();
    }

    private void Accounts_StateChanged(object? sender, EventArgs e)
        => _ = Dispatcher.InvokeAsync(RenderAccountSummary);

    private void RenderAccountSummary()
    {
        if (_privateWindow)
        {
            AccountDisplayName.Text = "Anonymní okno";
            AccountEmail.Text = "Účet je v tomto okně skrytý";
            AccountStatus.Text = "Přihlášení a synchronizace jsou vypnuté.";
            AccountSyncNote.Text = "Anonymní relace se nikdy nesynchronizuje.";
            ManageAccountButton.IsEnabled = false;
            _ = SetAccountAvatarAsync("");
            return;
        }

        var snapshot = _accounts.Snapshot;
        AccountDisplayName.Text = snapshot.DisplayName;
        AccountEmail.Text = snapshot.Email;
        AccountStatus.Text = snapshot.StatusText;
        AccountSyncNote.Text = snapshot.IsSignedIn
            ? "Účet je připojený, ale přenos místních dat zatím není aktivní; nic se neodesílá bez výslovného zapnutí."
            : "Synchronizace není aktivní; místní data se nikam neodesílají.";
        ManageAccountButton.IsEnabled = true;
        _ = SetAccountAvatarAsync(snapshot.AvatarUrl);
    }

    private async Task SetAccountAvatarAsync(string url)
    {
        var version = ++_avatarVersion;
        AccountAvatarImage.Visibility = Visibility.Collapsed;
        AccountAvatarBrush.ImageSource = null;
        if (string.IsNullOrWhiteSpace(url)) return;
        var image = await AvatarImageLoader.LoadAsync(url, _lifetime.Token);
        if (version != _avatarVersion || image is null || _lifetime.IsCancellationRequested) return;
        await Dispatcher.InvokeAsync(() =>
        {
            AccountAvatarBrush.ImageSource = image;
            AccountAvatarImage.Visibility = Visibility.Visible;
        });
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
        _settings.Data.EnableGeneralAutofill = EnableGeneralAutofill.IsChecked == true;
        _settings.Data.HardwareAccelerationEnabled = HardwareAcceleration.IsChecked == true;
        _settings.Data.BlockNewNotificationRequests = BlockNewNotificationRequests.IsChecked == true;
        _settings.Data.EnableNativeNotifications = EnableNativeNotifications.IsChecked == true;
        _settings.Data.EnableNotificationSound = EnableNotificationSound.IsChecked == true;
        _settings.Data.EnableTabNotificationIndicators = EnableTabNotificationIndicators.IsChecked == true;
        RestartRequired = _settings.Data.HardwareAccelerationEnabled != _originalHardwareAcceleration;
        DialogResult = true;
    }

    private void Close_Click(object sender, RoutedEventArgs e) => DialogResult = false;

    private void ManagePermissions_Click(object sender, RoutedEventArgs e)
    {
        if (_profile is null)
        {
            MessageBox.Show("Webový profil zatím není připraven.", "YamaSearch");
            return;
        }
        new PermissionsWindow(_profile, "", false) { Owner = this }.ShowDialog();
    }

    private void TestNotification_Click(object sender, RoutedEventArgs e)
    {
        if (EnableNativeNotifications.IsChecked != true)
        {
            MessageBox.Show("Nejdřív zapněte volbu „Zobrazovat oznámení Windows“.", "YamaSearch",
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (!WindowsToastService.TryShowTest(EnableNotificationSound.IsChecked == true, out var error))
            MessageBox.Show(error, "YamaSearch", MessageBoxButton.OK, MessageBoxImage.Warning);
    }

    private void ManageAccount_Click(object sender, RoutedEventArgs e)
    {
        new AccountWindow(_accounts, _settings, _privateWindow) { Owner = this }.ShowDialog();
        RenderAccountSummary();
    }

    private void DefaultBrowser_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            DefaultBrowserService.OpenWindowsDefaultApps();
        }
        catch (Exception error)
        {
            MessageBox.Show("Nastavení výchozího prohlížeče se nepodařilo otevřít: " + error.Message,
                "YamaSearch", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed)
            DragMove();
    }
}
