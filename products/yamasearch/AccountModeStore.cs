using System.IO;
using System.Text.Json;
namespace YamaSearch;

// An account-system preference contains no password or token. Both credential
// targets and profile caches remain separate; switching never signs out the other.
internal static class AccountModeStore
{
    private static string FilePath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YamaSearch", "account-system.json");
    internal static bool Read()
    {
        try
        {
            if (File.Exists(FilePath))
                return JsonSerializer.Deserialize<bool>(File.ReadAllText(FilePath));
        }
        catch { }
        return Environment.GetEnvironmentVariable("YAMAPORTAL_ACCOUNT") == "central";
    }
    internal static void Write(bool portal)
    {
        var directory = Path.GetDirectoryName(FilePath)!;
        Directory.CreateDirectory(directory);
        var temporary = FilePath + $".{Environment.ProcessId}.tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(portal));
        File.Move(temporary, FilePath, true);
    }
}
