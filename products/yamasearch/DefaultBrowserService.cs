using Microsoft.Win32;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace YamaSearch;

internal static class DefaultBrowserService
{
    private const string RegisteredName = "YamaSearch";
    private const string ProgId = "YamaSearch.Url";

    [DllImport("shell32.dll")]
    private static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2);

    public static void OpenWindowsDefaultApps()
    {
        RegisterCurrentExecutable();
        var targeted = "ms-settings:defaultapps?registeredAppUser=" + Uri.EscapeDataString(RegisteredName);
        try
        {
            Process.Start(new ProcessStartInfo(targeted) { UseShellExecute = true });
        }
        catch
        {
            Process.Start(new ProcessStartInfo("ms-settings:defaultapps") { UseShellExecute = true });
        }
    }

    internal static void RegisterCurrentExecutable()
    {
        var executable = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executable) || !File.Exists(executable))
            throw new InvalidOperationException("Spustitelný soubor YamaSearch nebyl nalezen.");

        var quotedCommand = $"\"{executable}\" --url=\"%1\"";
        using var classes = Registry.CurrentUser.CreateSubKey(@"Software\Classes", true);
        using var progId = classes?.CreateSubKey(ProgId, true);
        progId?.SetValue(null, "YamaSearch URL");
        progId?.SetValue("URL Protocol", "");
        using (var icon = progId?.CreateSubKey("DefaultIcon", true)) icon?.SetValue(null, $"\"{executable}\",0");
        using (var command = progId?.CreateSubKey(@"shell\open\command", true)) command?.SetValue(null, quotedCommand);

        const string clientPath = @"Software\Clients\StartMenuInternet\YamaSearch";
        using var client = Registry.CurrentUser.CreateSubKey(clientPath, true);
        client?.SetValue(null, "YamaSearch");
        using (var icon = client?.CreateSubKey("DefaultIcon", true)) icon?.SetValue(null, $"\"{executable}\",0");
        using (var command = client?.CreateSubKey(@"shell\open\command", true)) command?.SetValue(null, $"\"{executable}\"");
        using var capabilities = client?.CreateSubKey("Capabilities", true);
        capabilities?.SetValue("ApplicationName", "YamaSearch");
        capabilities?.SetValue("ApplicationDescription", "Soukromější webový prohlížeč s YamaBlock a YamaShield.");
        capabilities?.SetValue("ApplicationIcon", $"\"{executable}\",0");
        using (var associations = capabilities?.CreateSubKey("URLAssociations", true))
        {
            associations?.SetValue("http", ProgId);
            associations?.SetValue("https", ProgId);
        }

        using var registered = Registry.CurrentUser.CreateSubKey(@"Software\RegisteredApplications", true);
        registered?.SetValue(RegisteredName, clientPath + @"\Capabilities");
        SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
    }
}
