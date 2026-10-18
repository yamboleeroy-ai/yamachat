using YamaSearch;

var target = "YamaSearch.Test." + Guid.NewGuid().ToString("N");
try
{
    if (WindowsCredentialStore.Read(target) is not null)
        throw new InvalidOperationException("Nový testovací cíl nemá být uložený.");

    const string first = "obnovovací-token-ěščřžýáíé";
    WindowsCredentialStore.Write(target, first);
    if (!string.Equals(WindowsCredentialStore.Read(target), first, StringComparison.Ordinal))
        throw new InvalidOperationException("Unicode token se nevrátil beze změny.");

    const string rotated = "rotated-token-2";
    WindowsCredentialStore.Write(target, rotated);
    if (!string.Equals(WindowsCredentialStore.Read(target), rotated, StringComparison.Ordinal))
        throw new InvalidOperationException("Rotace tokenu nepřepsala původní hodnotu.");

    WindowsCredentialStore.Delete(target);
    if (WindowsCredentialStore.Read(target) is not null)
        throw new InvalidOperationException("Token zůstal po smazání uložený.");

    WindowsCredentialStore.Delete(target);
    Console.WriteLine("Windows Credential Manager smoke test: PASS");
}
finally
{
    WindowsCredentialStore.Delete(target);
}
