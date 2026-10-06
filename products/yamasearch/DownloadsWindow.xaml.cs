using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;

namespace YamaSearch;

public partial class DownloadsWindow : Window
{
    private readonly SettingsStore _settings;
    private readonly Action _changed;
    private readonly DispatcherTimer _refreshTimer;

    public DownloadsWindow(SettingsStore settings, Action changed)
    {
        InitializeComponent();
        _settings = settings;
        _changed = changed;
        _refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(700) };
        _refreshTimer.Tick += (_, _) => RefreshList();
        Loaded += (_, _) => { RefreshList(); _refreshTimer.Start(); };
        Closed += (_, _) => _refreshTimer.Stop();
    }

    private void RefreshList()
    {
        DownloadList.Children.Clear();
        if (_settings.Data.Downloads.Count == 0)
        {
            DownloadList.Children.Add(new TextBlock
            {
                Text = "Zatím nebyly staženy žádné soubory.",
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#96A7BD")),
                Margin = new Thickness(14),
                TextWrapping = TextWrapping.Wrap
            });
            return;
        }

        foreach (var entry in _settings.Data.Downloads.ToList())
            DownloadList.Children.Add(CreateRow(entry));
    }

    private FrameworkElement CreateRow(DownloadEntry entry)
    {
        var border = new Border
        {
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#10233B")),
            BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#245A84")),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(14),
            Margin = new Thickness(0, 5, 0, 5)
        };

        var root = new Grid();
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(42) });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        root.Children.Add(new TextBlock
        {
            Text = entry.State == "Dokončeno" ? "✓" : entry.State == "Přerušeno" ? "!" : "⇩",
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(entry.State == "Dokončeno" ? "#4ADE80" : entry.State == "Přerušeno" ? "#FCA5A5" : "#54D7F8")),
            FontSize = 22,
            FontWeight = FontWeights.Bold,
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center
        });

        var info = new StackPanel();
        info.Children.Add(new TextBlock
        {
            Text = string.IsNullOrWhiteSpace(entry.FileName) ? "Stažený soubor" : entry.FileName,
            FontSize = 14,
            FontWeight = FontWeights.SemiBold,
            Foreground = Brushes.White,
            TextTrimming = TextTrimming.CharacterEllipsis
        });

        var progress = entry.TotalBytes > 0 ? Math.Clamp((double)entry.BytesReceived / entry.TotalBytes, 0, 1) : 0;
        var status = entry.State == "Probíhá"
            ? (entry.TotalBytes > 0 ? $"{progress:P0} · {FormatBytes(entry.BytesReceived)} z {FormatBytes(entry.TotalBytes)}" : $"{FormatBytes(entry.BytesReceived)} staženo")
            : $"{entry.State} · {entry.StartedAt:dd.MM.yyyy HH:mm}";

        info.Children.Add(new TextBlock
        {
            Text = status,
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#91A8C2")),
            FontSize = 11,
            Margin = new Thickness(0, 3, 0, 0)
        });

        if (entry.State == "Probíhá")
        {
            info.Children.Add(new ProgressBar
            {
                Minimum = 0,
                Maximum = 1,
                Value = progress,
                Height = 5,
                Margin = new Thickness(0, 8, 0, 0)
            });
        }
        else if (!string.IsNullOrWhiteSpace(entry.FilePath))
        {
            info.Children.Add(new TextBlock
            {
                Text = entry.FilePath,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#6F88A6")),
                FontSize = 10,
                Margin = new Thickness(0, 4, 0, 0),
                TextTrimming = TextTrimming.CharacterEllipsis
            });
        }

        Grid.SetColumn(info, 1);
        root.Children.Add(info);

        var actions = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        if (entry.State == "Dokončeno")
        {
            var open = new Button { Content = "Otevřít", Style = (Style)FindResource("YamaSecondaryButton"), Margin = new Thickness(4, 0, 0, 0) };
            open.Click += (_, _) => OpenFile(entry);
            actions.Children.Add(open);

            var folder = new Button { Content = "Složka", Style = (Style)FindResource("YamaSecondaryButton"), Margin = new Thickness(4, 0, 0, 0) };
            folder.Click += (_, _) => OpenFolder(entry);
            actions.Children.Add(folder);
        }

        var remove = new Button
        {
            Content = "×",
            ToolTip = entry.State == "Probíhá" ? "Aktivní stahování nelze odstranit z historie" : "Odebrat z historie",
            IsEnabled = entry.State != "Probíhá",
            Style = (Style)FindResource("YamaDangerButton"),
            Margin = new Thickness(5, 0, 0, 0)
        };
        remove.Click += (_, _) =>
        {
            _settings.Data.Downloads.Remove(entry);
            _settings.Save();
            _changed();
            RefreshList();
        };
        actions.Children.Add(remove);

        Grid.SetColumn(actions, 2);
        root.Children.Add(actions);
        border.Child = root;
        return border;
    }

    private void Close_Click(object sender, RoutedEventArgs e) => Close();

    private void ClearHistory_Click(object sender, RoutedEventArgs e)
    {
        var removable = _settings.Data.Downloads.Where(x => x.State != "Probíhá").ToList();
        if (removable.Count == 0) return;
        if (MessageBox.Show("Vymazat dokončenou historii stahování? Stažené soubory na disku zůstanou.", "YamaSearch", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        foreach (var item in removable) _settings.Data.Downloads.Remove(item);
        _settings.Save();
        _changed();
        RefreshList();
    }

    private static void OpenFile(DownloadEntry entry)
    {
        if (!string.IsNullOrWhiteSpace(entry.FilePath) && File.Exists(entry.FilePath))
            Process.Start(new ProcessStartInfo(entry.FilePath) { UseShellExecute = true });
    }

    private static void OpenFolder(DownloadEntry entry)
    {
        if (string.IsNullOrWhiteSpace(entry.FilePath)) return;
        var folder = Path.GetDirectoryName(entry.FilePath);
        if (!string.IsNullOrWhiteSpace(folder) && Directory.Exists(folder))
            Process.Start(new ProcessStartInfo(folder) { UseShellExecute = true });
    }

    private static string FormatBytes(long bytes)
    {
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        var value = Math.Max(0, (double)bytes);
        var unit = 0;
        while (value >= 1024 && unit < units.Length - 1) { value /= 1024; unit++; }
        return unit == 0 ? $"{value:0} {units[unit]}" : $"{value:0.##} {units[unit]}";
    }
}