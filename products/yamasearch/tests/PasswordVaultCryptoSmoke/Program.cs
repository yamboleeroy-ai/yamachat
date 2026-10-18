using System.Security.Cryptography;
using System.Text;
using YamaSearch;

const string passphrase = "správné dlouhé heslo 🔐 2026";
var (header, createdKey) = PasswordVaultCrypto.Create(passphrase);
using (createdKey)
{
    using var unlockedKey = PasswordVaultCrypto.Unlock(header, passphrase);
    var itemId = Guid.NewGuid();
    var plaintext = Encoding.UTF8.GetBytes("{\"url\":\"https://example.test\",\"username\":\"uživatel\",\"password\":\"tajné-ěščřž\"}");
    var encrypted = PasswordVaultCrypto.EncryptItem(unlockedKey, itemId, plaintext);
    var decrypted = PasswordVaultCrypto.DecryptItem(unlockedKey, itemId, encrypted);
    if (!CryptographicOperations.FixedTimeEquals(plaintext, decrypted))
        throw new InvalidOperationException("Obsah se po dešifrování změnil.");
    CryptographicOperations.ZeroMemory(decrypted);

    var second = PasswordVaultCrypto.EncryptItem(unlockedKey, itemId, plaintext);
    if (encrypted.Nonce.SequenceEqual(second.Nonce) || encrypted.Ciphertext.SequenceEqual(second.Ciphertext))
        throw new InvalidOperationException("Dvě šifrování použila stejný výstup nebo nonce.");

    var tampered = encrypted with { Ciphertext = encrypted.Ciphertext.ToArray() };
    tampered.Ciphertext[0] ^= 0x40;
    try
    {
        PasswordVaultCrypto.DecryptItem(unlockedKey, itemId, tampered);
        throw new InvalidOperationException("Pozměněný ciphertext byl přijat.");
    }
    catch (CryptographicException) { }

    try
    {
        PasswordVaultCrypto.DecryptItem(unlockedKey, Guid.NewGuid(), encrypted);
        throw new InvalidOperationException("Položka šla přesunout pod jiné ID.");
    }
    catch (CryptographicException) { }

    CryptographicOperations.ZeroMemory(plaintext);
}

try
{
    using var _ = PasswordVaultCrypto.Unlock(header, "nesprávné dlouhé heslo");
    throw new InvalidOperationException("Nesprávné heslo odemklo trezor.");
}
catch (InvalidOperationException error) when (error.Message.Contains("není správné", StringComparison.Ordinal)) { }

Console.WriteLine("Password vault cryptography smoke test: PASS");
