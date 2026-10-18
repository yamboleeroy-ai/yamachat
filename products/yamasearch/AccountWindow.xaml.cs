using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace YamaSearch;

public partial class AccountWindow : Window
{
    private readonly AccountService _accounts;
    private readonly SettingsStore _settings;
    private readonly bool _privateWindow;
    private readonly CancellationTokenSource _lifetime = new();
    private int _avatarVersion;

    public AccountWindow(AccountService accounts, SettingsStore settings, bool privateWindow)
    {
        InitializeComponent();
        _accounts = accounts;
        _settings = settings;
        _privateWindow = privateWindow;
        _accounts.StateChanged += Accounts_StateChanged;
        Closed += (_, _) =>
        {
            _accounts.StateChanged -= Accounts_StateChanged;
            _lifetime.Cancel();
            _lifetime.Dispose();
        };
        Loaded += AccountWindow_Loaded;
        Render(_accounts.Snapshot);
    }

    private async void AccountWindow_Loaded(object sender, RoutedEventArgs e)
    {
        try { await _accounts.InitializeAsync(_lifetime.Token); }
        catch (OperationCanceledException) { }
        catch { Render(_accounts.Snapshot); }
    }

    private void Accounts_StateChanged(object? sender, EventArgs e)
        => _ = Dispatcher.InvokeAsync(() => Render(_accounts.Snapshot));

    private void Render(AccountSnapshot snapshot)
    {
        if (_privateWindow)
        {
            DisplayNameText.Text = "Anonymní okno";
            EmailText.Text = "Účet je v anonymním okně skrytý";
            StatusText.Text = "Přihlášení ani synchronizace se v tomto okně nepoužívají.";
            SignInCard.Visibility = Visibility.Collapsed;
            LinkedAccountsCard.Visibility = Visibility.Collapsed;
            SignedInActionsCard.Visibility = Visibility.Collapsed;
            RetryButton.Visibility = Visibility.Collapsed;
            SyncStatusText.Text = "Synchronizace je v anonymním okně vypnutá.";
            _ = SetAvatarAsync("");
            return;
        }

        DisplayNameText.Text = snapshot.DisplayName;
        EmailText.Text = snapshot.Email;
        StatusText.Text = snapshot.StatusText;
        RetryButton.Visibility = snapshot.State is AccountConnectionState.Offline or AccountConnectionState.Error
            ? Visibility.Visible
            : Visibility.Collapsed;
        SignInCard.Visibility = snapshot.IsSignedIn ? Visibility.Collapsed : Visibility.Visible;
        LinkedAccountsCard.Visibility = snapshot.IsSignedIn ? Visibility.Visible : Visibility.Collapsed;
        SignedInActionsCard.Visibility = snapshot.IsSignedIn ? Visibility.Visible : Visibility.Collapsed;
        SyncStatusText.Text = snapshot.IsSignedIn
            ? "Samostatný backend YamaSearch je připravený, ale přenos místních dat zůstává vypnutý, dokud nebude dokončený a ověřený synchronizační klient."
            : "Synchronizace není zapnutá. Místní oblíbené, nastavení ani historie se nikam neodesílají.";

        RenderSignInProviders(snapshot);
        RenderLinkedAccounts(snapshot);
        _ = SetAvatarAsync(snapshot.AvatarUrl);
    }

    private void RenderSignInProviders(AccountSnapshot snapshot)
    {
        SignInProvidersPanel.Children.Clear();
        foreach (var provider in snapshot.AvailableProviders)
        {
            var button = new Button
            {
                Content = $"Pokračovat přes {provider.DisplayName}",
                Style = (Style)FindResource("YamaPrimaryButton"),
                HorizontalContentAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(0, 0, 0, 8),
                Tag = provider,
                IsEnabled = snapshot.State != AccountConnectionState.SigningIn
            };
            button.Click += SignInProvider_Click;
            SignInProvidersPanel.Children.Add(button);
        }
        NoProvidersText.Visibility = snapshot.AvailableProviders.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private void RenderLinkedAccounts(AccountSnapshot snapshot)
    {
        LinkedAccountsPanel.Children.Clear();
        foreach (var identity in snapshot.Identities)
        {
            var row = new Grid { Margin = new Thickness(0, 0, 0, 8) };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var preferred = _settings.Data.PreferredAccountProvider.Equals(identity.Provider, StringComparison.Ordinal);
            var marker = new Button
            {
                Content = preferred ? "★" : "☆",
                ToolTip = preferred ? "Preferovaný způsob přihlášení" : "Nastavit jako preferovaný způsob",
                Width = 40,
                Height = 38,
                Padding = new Thickness(0),
                Tag = identity
            };
            marker.Click += PreferredIdentity_Click;
            row.Children.Add(marker);

            var details = new StackPanel { Margin = new Thickness(10, 0, 10, 0), VerticalAlignment = VerticalAlignment.Center };
            details.Children.Add(new TextBlock { Text = ProviderDisplayName(identity.Provider), FontWeight = FontWeights.SemiBold, Foreground = System.Windows.Media.Brushes.White });
            details.Children.Add(new TextBlock { Text = identity.Email, Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(156, 180, 207)), FontSize = 11 });
            Grid.SetColumn(details, 1);
            row.Children.Add(details);

            if (_accounts.CanUnlinkIdentities)
            {
                var unlink = new Button
                {
                    Content = "Odpojit",
                    Style = (Style)FindResource("YamaDangerButton"),
                    Tag = identity,
                    IsEnabled = snapshot.Identities.Count > 1
                };
                unlink.Click += UnlinkIdentity_Click;
                Grid.SetColumn(unlink, 2);
                row.Children.Add(unlink);
            }
            LinkedAccountsPanel.Children.Add(row);
        }

        LinkProvidersPanel.Children.Clear();
        if (!_accounts.CanLinkIdentities)
        {
            LinkProvidersPanel.Children.Add(new TextBlock
            {
                Text = "Připojování a odpojování dalších účtů se zobrazí až po ověření této funkce na samostatném serveru YamaSearch.",
                Style = (Style)FindResource("YamaSubtleText"),
                TextWrapping = TextWrapping.Wrap
            });
            return;
        }
        foreach (var provider in snapshot.AvailableProviders.Where(provider => !snapshot.Identities.Any(identity => IdentityMatches(identity.Provider, provider.Id))))
        {
            var link = new Button
            {
                Content = $"Připojit {provider.DisplayName}",
                Style = (Style)FindResource("YamaSecondaryButton"),
                HorizontalContentAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(0, 0, 0, 8),
                Tag = provider
            };
            link.Click += LinkIdentity_Click;
            LinkProvidersPanel.Children.Add(link);
        }
        if (LinkProvidersPanel.Children.Count == 0)
            LinkProvidersPanel.Children.Add(new TextBlock { Text = "Všechny dostupné způsoby jsou už propojené.", Style = (Style)FindResource("YamaSubtleText") });
    }

    private async Task SetAvatarAsync(string url)
    {
        var version = ++_avatarVersion;
        AvatarImage.Visibility = Visibility.Collapsed;
        AvatarImageBrush.ImageSource = null;
        if (string.IsNullOrWhiteSpace(url)) return;
        var image = await AvatarImageLoader.LoadAsync(url, _lifetime.Token);
        if (version != _avatarVersion || image is null || _lifetime.IsCancellationRequested) return;
        await Dispatcher.InvokeAsync(() =>
        {
            AvatarImageBrush.ImageSource = image;
            AvatarImage.Visibility = Visibility.Visible;
        });
    }

    private async void SignInProvider_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: AccountProviderSnapshot provider }) return;
        await RunAccountActionAsync(token => _accounts.SignInAsync(provider, token));
    }

    private async void LinkIdentity_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: AccountProviderSnapshot provider }) return;
        await RunAccountActionAsync(token => _accounts.LinkIdentityAsync(provider, token));
    }

    private async void UnlinkIdentity_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: AccountIdentitySnapshot identity }) return;
        if (MessageBox.Show($"Opravdu odpojit {ProviderDisplayName(identity.Provider)}?", "YamaSearch", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
            return;
        await RunAccountActionAsync(token => _accounts.UnlinkIdentityAsync(identity, token));
    }

    private void PreferredIdentity_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: AccountIdentitySnapshot identity }) return;
        _settings.Data.PreferredAccountProvider = identity.Provider;
        _settings.Save();
        Render(_accounts.Snapshot);
    }

    private async void Retry_Click(object sender, RoutedEventArgs e)
        => await RunAccountActionAsync(_accounts.RetryAsync);

    private async void SignOut_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Odhlásit účet YamaSearch na tomto zařízení? Místní data prohlížeče zůstanou zachována.", "YamaSearch", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes)
            return;
        await RunAccountActionAsync(_accounts.SignOutAsync);
    }

    private async Task RunAccountActionAsync(Func<CancellationToken, Task> action)
    {
        try { await action(_lifetime.Token); }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            MessageBox.Show(error is AccountApiException or InvalidOperationException or TimeoutException
                    ? error.Message
                    : "Operaci účtu se nepodařilo dokončit.",
                "YamaSearch", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private static bool IdentityMatches(string identityProvider, string configuredProvider)
        => identityProvider.Equals(configuredProvider, StringComparison.Ordinal);

    private static string ProviderDisplayName(string provider) => provider switch
    {
        "google" => "Google",
        "azure" => "Microsoft",
        "apple" => "Apple",
        "github" => "GitHub",
        "discord" => "Discord",
        "facebook" => "Facebook",
        "custom:seznam" => "Seznam.cz",
        _ => provider
    };

    private void Close_Click(object sender, RoutedEventArgs e) => Close();

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed) DragMove();
    }
}
