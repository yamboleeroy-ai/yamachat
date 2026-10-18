using System.IO;
using System.Text.Json;

namespace YamaSearch;

internal sealed record CachedAccountProfile(
    string DisplayName,
    string Email,
    string AvatarUrl,
    IReadOnlyList<AccountIdentitySnapshot> Identities);

internal static class AccountProfileCache
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = false };

    internal static CachedAccountProfile? Read()
    {
        try
        {
            var path = CachePath();
            if (!File.Exists(path)) return null;
            var cached = JsonSerializer.Deserialize<CachedAccountProfile>(File.ReadAllText(path), JsonOptions);
            return cached is { Email.Length: > 0 } ? cached : null;
        }
        catch
        {
            return null;
        }
    }

    internal static void Write(AccountSnapshot snapshot)
    {
        if (!snapshot.IsSignedIn || string.IsNullOrWhiteSpace(snapshot.Email)) return;
        try
        {
            var path = CachePath();
            var directory = Path.GetDirectoryName(path)!;
            Directory.CreateDirectory(directory);
            var temporary = path + $".{Environment.ProcessId}.tmp";
            var cached = new CachedAccountProfile(
                snapshot.DisplayName,
                snapshot.Email,
                snapshot.AvatarUrl,
                snapshot.Identities);
            File.WriteAllText(temporary, JsonSerializer.Serialize(cached, JsonOptions));
            File.Move(temporary, path, true);
        }
        catch (Exception error)
        {
            AccountDiagnostics.Write("profile-cache-write", error);
        }
    }

    internal static void Delete()
    {
        try
        {
            var path = CachePath();
            if (File.Exists(path)) File.Delete(path);
            if (File.Exists(path + ".tmp")) File.Delete(path + ".tmp");
        }
        catch
        {
            // Removing the refresh token is authoritative. A stale display-only
            // cache must never make local sign-out fail.
        }
    }

    private static string CachePath() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "YamaSearch",
        "account-profile.json");
}

internal static class AccountDiagnostics
{
    internal static void Write(string operation, Exception error)
    {
        try
        {
            var directory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "YamaSearch");
            Directory.CreateDirectory(directory);
            var message = $"{DateTimeOffset.Now:O}\t{operation}\t{error.GetType().FullName}\t0x{error.HResult:X8}\t{error.Message}{Environment.NewLine}{error.StackTrace}{Environment.NewLine}";
            File.AppendAllText(Path.Combine(directory, "account-diagnostics.log"), message);
        }
        catch
        {
            // Diagnostics must never affect browser startup or authentication.
        }
    }
}
