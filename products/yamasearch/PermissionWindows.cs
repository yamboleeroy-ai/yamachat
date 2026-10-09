using Microsoft.Web.WebView2.Core;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace YamaSearch;

internal static class PermissionLabels
{
    public static string For(CoreWebView2PermissionKind kind) => kind switch
    {
        CoreWebView2PermissionKind.Notifications => "oznámení",
        CoreWebView2PermissionKind.Camera => "kameru",
        CoreWebView2PermissionKind.Microphone => "mikrofon",
        CoreWebView2PermissionKind.Geolocation => "polohu",
        CoreWebView2PermissionKind.ClipboardRead => "schránku",
        _ => kind.ToString()
    };

    public static string ToOrigin(string? raw)
        => Uri.TryCreate(raw, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
            ? uri.GetLeftPart(UriPartial.Authority)
            : "Tato stránka";
}

public sealed class PermissionPromptWindow : Window
{
    public PermissionPromptWindow(string origin, string permission)
    {
        Title = "YamaSearch – oprávnění webu";
        Width = 450; Height = 260; ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#08111D"));
        Foreground = Brushes.White;

        var panel = new StackPanel { Margin = new Thickness(24) };
        panel.Children.Add(new TextBlock { Text = "Oprávnění webu", FontSize = 21, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#42D8FF")) });
        panel.Children.Add(new TextBlock { Text = origin, FontSize = 15, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 20, 0, 5), TextWrapping = TextWrapping.Wrap });
        panel.Children.Add(new TextBlock { Text = $"chce používat {permission}.", Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#B7CAE4")), TextWrapping = TextWrapping.Wrap });
        panel.Children.Add(new TextBlock { Text = "Rozhodnutí se uloží jen pro tento přesný původ stránky. V anonymním okně se po zavření neuloží.", FontSize = 12, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#7F9CBC")), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 10, 0, 18) });

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        var deny = CreateButton("Blokovat", "#34202B");
        deny.Click += (_, _) => DialogResult = false;
        var allow = CreateButton("Povolit", "#12648A");
        allow.Margin = new Thickness(10, 0, 0, 0);
        allow.Click += (_, _) => DialogResult = true;
        buttons.Children.Add(deny); buttons.Children.Add(allow);
        panel.Children.Add(buttons);
        Content = new Border { BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#245A84")), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(12), Child = panel };
    }

    private static Button CreateButton(string text, string background) => new()
    {
        Content = text, MinWidth = 110, Height = 38, Padding = new Thickness(14, 0, 14, 0),
        Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(background)),
        Foreground = Brushes.White, BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3B80B8")), BorderThickness = new Thickness(1)
    };
}

public sealed class PermissionsWindow : Window
{
    private readonly CoreWebView2Profile _profile;
    private readonly string _origin;
    private readonly StackPanel _list = new();
    private readonly TextBox _search = new() { Height = 34, Margin = new Thickness(0, 12, 0, 0), ToolTip = "Vyhledat web" };

    public PermissionsWindow(CoreWebView2Profile profile, string origin, bool isPrivate)
    {
        _profile = profile; _origin = origin;
        Title = "YamaSearch – oprávnění webů";
        Width = 650; Height = 620; MinWidth = 520; MinHeight = 420;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#08111D")); Foreground = Brushes.White;
        var panel = new DockPanel { Margin = new Thickness(22) };
        var close = new Button { Content = "Zavřít", Height = 38, MinWidth = 105, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 14, 0, 0) };
        close.Click += (_, _) => Close();
        DockPanel.SetDock(close, Dock.Bottom); panel.Children.Add(close);
        var header = new StackPanel { Margin = new Thickness(0, 0, 0, 15) };
        header.Children.Add(new TextBlock { Text = "Oprávnění webů", FontSize = 22, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#42D8FF")) });
        header.Children.Add(new TextBlock { Text = isPrivate ? "Anonymní relace — změny se po zavření okna neukládají." : $"Aktuální stránka: {_origin}", Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#9BB5D2")), Margin = new Thickness(0, 5, 0, 0), TextWrapping = TextWrapping.Wrap });
        if (string.IsNullOrWhiteSpace(_origin))
        {
            _search.TextChanged += async (_, _) => await LoadAsync();
            header.Children.Add(_search);
        }
        DockPanel.SetDock(header, Dock.Top); panel.Children.Add(header);
        var scroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = _list };
        panel.Children.Add(scroll);
        Content = new Border { BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#245A84")), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(12), Child = panel };
        Loaded += async (_, _) => await LoadAsync();
    }

    private async Task LoadAsync()
    {
        _list.Children.Clear();
        var settings = await _profile.GetNonDefaultPermissionSettingsAsync();
        var query = _search.Text.Trim();
        var visible = settings.Where(x => (string.IsNullOrWhiteSpace(_origin) || _origin == "Tato stránka" || string.Equals(x.PermissionOrigin, _origin, StringComparison.OrdinalIgnoreCase))
            && (string.IsNullOrWhiteSpace(query) || x.PermissionOrigin.Contains(query, StringComparison.OrdinalIgnoreCase))).ToList();
        if (visible.Count == 0)
        {
            _list.Children.Add(new TextBlock { Text = "Pro tuto stránku zatím není uložené žádné rozhodnutí. Při další žádosti se zobrazí dialog.", Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#9BB5D2")), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(4) });
            return;
        }
        foreach (var setting in visible)
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 4, 0, 4) };
            row.Children.Add(new TextBlock { Text = $"{setting.PermissionOrigin} · {PermissionLabels.For(setting.PermissionKind)} — {setting.PermissionState}", Width = 310, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis, ToolTip = setting.PermissionOrigin });
            var allow = new Button { Content = "Povolit", MinWidth = 74, Height = 34, Margin = new Thickness(4, 0, 0, 0) };
            allow.Click += async (_, _) => { await _profile.SetPermissionStateAsync(setting.PermissionKind, setting.PermissionOrigin, CoreWebView2PermissionState.Allow); await LoadAsync(); };
            row.Children.Add(allow);
            var deny = new Button { Content = "Blokovat", MinWidth = 78, Height = 34, Margin = new Thickness(4, 0, 0, 0) };
            deny.Click += async (_, _) => { await _profile.SetPermissionStateAsync(setting.PermissionKind, setting.PermissionOrigin, CoreWebView2PermissionState.Deny); await LoadAsync(); };
            row.Children.Add(deny);
            var reset = new Button { Content = "Zeptat", MinWidth = 65, Height = 34, Margin = new Thickness(4, 0, 0, 0) };
            reset.Click += async (_, _) => { await _profile.SetPermissionStateAsync(setting.PermissionKind, setting.PermissionOrigin, CoreWebView2PermissionState.Default); await LoadAsync(); };
            row.Children.Add(reset); _list.Children.Add(row);
        }
    }
}
