using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace YamaSearch;

public partial class HistoryWindow : Window
{
    private readonly SettingsStore _settings;
    private readonly Action<string> _openUrl;
    private readonly Action _changed;

    public HistoryWindow(SettingsStore settings, Action<string> openUrl, Action changed)
    {
        InitializeComponent();
        _settings = settings;
        _openUrl = openUrl;
        _changed = changed;
        Loaded += (_, _) => RefreshList();
    }

    private void RefreshList()
    {
        HistoryList.Children.Clear();
        if (_settings.Data.History.Count == 0)
        {
            HistoryList.Children.Add(new TextBlock
            {
                Text = "Historie je zatím prázdná.",
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#96A7BD")),
                Margin = new Thickness(14)
            });
            return;
        }

        foreach (var entry in _settings.Data.History.ToList())
            HistoryList.Children.Add(CreateRow(entry));
    }

    private FrameworkElement CreateRow(HistoryEntry entry)
    {
        var border = new Border
        {
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#132238")),
            BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1D3857")),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(12),
            Margin = new Thickness(0, 4, 0, 4)
        };

        var root = new Grid();
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var info = new StackPanel();
        info.Children.Add(new TextBlock
        {
            Text = string.IsNullOrWhiteSpace(entry.Title) ? entry.Url : entry.Title,
            FontSize = 14,
            FontWeight = FontWeights.SemiBold,
            Foreground = Brushes.White,
            TextTrimming = TextTrimming.CharacterEllipsis
        });
        info.Children.Add(new TextBlock
        {
            Text = entry.Url,
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#91A8C2")),
            FontSize = 11,
            Margin = new Thickness(0, 3, 0, 0),
            TextTrimming = TextTrimming.CharacterEllipsis
        });
        info.Children.Add(new TextBlock
        {
            Text = entry.VisitedAt.ToString("dd.MM.yyyy HH:mm"),
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#6F88A6")),
            FontSize = 10,
            Margin = new Thickness(0, 3, 0, 0)
        });
        root.Children.Add(info);

        var actions = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        var open = new Button { Content = "Otevřít", Margin = new Thickness(4, 0, 0, 0), Padding = new Thickness(10, 6) };
        open.Click += (_, _) => { _openUrl(entry.Url); Close(); };
        actions.Children.Add(open);

        var remove = new Button
        {
            Content = "×",
            ToolTip = "Smazat tuto položku",
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFB7C5")),
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#35202B")),
            Margin = new Thickness(5, 0, 0, 0),
            Padding = new Thickness(10, 6)
        };
        remove.Click += (_, _) =>
        {
            _settings.Data.History.Remove(entry);
            _settings.Save();
            _changed();
            RefreshList();
        };
        actions.Children.Add(remove);
        Grid.SetColumn(actions, 1);
        root.Children.Add(actions);

        border.Child = root;
        return border;
    }

    private void ClearHistory_Click(object sender, RoutedEventArgs e)
    {
        if (_settings.Data.History.Count == 0) return;
        if (MessageBox.Show("Opravdu chceš vymazat celou historii prohlížení?", "YamaSearch", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        _settings.Data.History.Clear();
        _settings.Save();
        _changed();
        RefreshList();
    }
}