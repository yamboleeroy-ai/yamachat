using System.IO;
using System.Text.Json;

namespace YamaSearch;

/// <summary>Stores only the user's persistence preference, never credentials.</summary>
internal static class AccountSessionPreferenceStore
{
    private static string DefaultPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "YamaSearch",
        "session-preferences.json");

    internal static bool Read(bool portalAccount, string? path = null)
    {
        try
        {
            var target = path ?? DefaultPath;
            if (!File.Exists(target)) return true; // Preserve the existing persistent-session behavior.
            using var document = JsonDocument.Parse(File.ReadAllText(target));
            var name = portalAccount ? "portal" : "search";
            return document.RootElement.ValueKind == JsonValueKind.Object
                && document.RootElement.TryGetProperty(name, out var value)
                && value.ValueKind is JsonValueKind.True or JsonValueKind.False
                    ? value.GetBoolean()
                    : true;
        }
        catch
        {
            return true;
        }
    }

    internal static void Write(bool portalAccount, bool remember, string? path = null)
    {
        var target = path ?? DefaultPath;
        var preferences = new Dictionary<string, bool>(StringComparer.Ordinal);
        try
        {
            if (File.Exists(target))
            {
                var existing = JsonSerializer.Deserialize<Dictionary<string, bool>>(File.ReadAllText(target));
                if (existing is not null)
                    preferences = new Dictionary<string, bool>(existing, StringComparer.Ordinal);
            }
        }
        catch
        {
            // A malformed preference file contains no credentials; replace it with a valid setting.
        }

        preferences[portalAccount ? "portal" : "search"] = remember;
        var directory = Path.GetDirectoryName(target);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        var temporary = target + $".{Environment.ProcessId}.tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(preferences));
        File.Move(temporary, target, true);
    }
}
