using System.Windows;
using System.Windows.Input;

namespace YamaSearch;

public enum YamaSearchUpdateChoice
{
    Later,
    Installer,
    Portable
}

public partial class UpdateWindow : Window
{
    public YamaSearchUpdateChoice Choice { get; private set; } = YamaSearchUpdateChoice.Later;

    public UpdateWindow(Version current, Version available, string notes, bool installedBuild)
    {
        InitializeComponent();
        VersionText.Text = $"Aktuální: {current}  →  Nová: {available}";
        NotesText.Text = string.IsNullOrWhiteSpace(notes) ? "Nová verze obsahuje opravy a vylepšení." : notes;
        ModeText.Text = installedBuild
            ? "Používáš instalovanou verzi. Tlačítko „Nainstalovat aktualizaci“ nový instalátor stáhne, spustí a YamaSearch se před instalací ukončí."
            : "Používáš Portable verzi. „Nainstalovat aktualizaci“ přejde na standardní instalaci YamaSearch. Pokud chceš zůstat u Portable, stáhni nový ZIP a spusť YamaSearch z nově rozbalené složky.";
    }

    private void Installer_Click(object sender, RoutedEventArgs e)
    {
        Choice = YamaSearchUpdateChoice.Installer;
        DialogResult = true;
    }

    private void Portable_Click(object sender, RoutedEventArgs e)
    {
        Choice = YamaSearchUpdateChoice.Portable;
        DialogResult = true;
    }

    private void Later_Click(object sender, RoutedEventArgs e)
    {
        Choice = YamaSearchUpdateChoice.Later;
        DialogResult = false;
    }

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed)
            DragMove();
    }
}