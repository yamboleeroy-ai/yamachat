using System.Security.Cryptography;
using System.Text;

namespace YamaSearch;

internal static class PasswordVaultCrypto
{
    internal const int CurrentVersion = 1;
    internal const int DefaultPbkdf2Iterations = 600_000;
    private const int KeySize = 32;
    private const int SaltSize = 32;
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private static readonly byte[] KeyWrapAad = Encoding.UTF8.GetBytes("YamaSearch.PasswordVault.Key.v1");
    private static readonly byte[] KeyCheckPlaintext = Encoding.UTF8.GetBytes("YamaSearch.PasswordVault.Valid.v1");

    public static (VaultHeader Header, VaultKey Key) Create(string passphrase)
    {
        ValidatePassphrase(passphrase);
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var vaultKeyBytes = RandomNumberGenerator.GetBytes(KeySize);
        var wrappingKey = DeriveWrappingKey(passphrase, salt, DefaultPbkdf2Iterations);
        try
        {
            var wrappedKey = Encrypt(wrappingKey, vaultKeyBytes, KeyWrapAad);
            var keyCheck = Encrypt(vaultKeyBytes, KeyCheckPlaintext, KeyWrapAad);
            return (new VaultHeader(
                CurrentVersion,
                "pbkdf2-sha256",
                DefaultPbkdf2Iterations,
                salt,
                wrappedKey.Nonce,
                wrappedKey.Ciphertext,
                wrappedKey.Tag,
                keyCheck.Nonce,
                keyCheck.Ciphertext,
                keyCheck.Tag), new VaultKey(vaultKeyBytes));
        }
        catch
        {
            CryptographicOperations.ZeroMemory(vaultKeyBytes);
            throw;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(wrappingKey);
        }
    }

    public static VaultKey Unlock(VaultHeader header, string passphrase)
    {
        ValidateHeader(header);
        ValidatePassphrase(passphrase);
        var wrappingKey = DeriveWrappingKey(passphrase, header.Salt, header.Iterations);
        byte[]? vaultKey = null;
        try
        {
            vaultKey = Decrypt(wrappingKey, header.WrapNonce, header.WrappedKey, header.WrapTag, KeyWrapAad);
            if (vaultKey.Length != KeySize) throw new CryptographicException("Neplatný klíč trezoru.");
            var check = Decrypt(vaultKey, header.CheckNonce, header.CheckCiphertext, header.CheckTag, KeyWrapAad);
            try
            {
                if (!CryptographicOperations.FixedTimeEquals(check, KeyCheckPlaintext))
                    throw new CryptographicException("Trezor se nepodařilo ověřit.");
            }
            finally
            {
                CryptographicOperations.ZeroMemory(check);
            }
            return new VaultKey(vaultKey);
        }
        catch (CryptographicException)
        {
            if (vaultKey is not null) CryptographicOperations.ZeroMemory(vaultKey);
            throw new InvalidOperationException("Synchronizační heslo není správné nebo byl trezor poškozen.");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(wrappingKey);
        }
    }

    public static VaultCiphertext EncryptItem(VaultKey key, Guid itemId, ReadOnlySpan<byte> plaintext)
    {
        ArgumentNullException.ThrowIfNull(key);
        key.ThrowIfDisposed();
        if (plaintext.Length == 0 || plaintext.Length > 64 * 1024)
            throw new ArgumentOutOfRangeException(nameof(plaintext), "Položka trezoru musí mít 1 až 65536 bajtů.");
        return Encrypt(key.Bytes, plaintext, ItemAad(itemId));
    }

    public static byte[] DecryptItem(VaultKey key, Guid itemId, VaultCiphertext item)
    {
        ArgumentNullException.ThrowIfNull(key);
        ArgumentNullException.ThrowIfNull(item);
        key.ThrowIfDisposed();
        ValidateCiphertext(item);
        return Decrypt(key.Bytes, item.Nonce, item.Ciphertext, item.Tag, ItemAad(itemId));
    }

    private static byte[] DeriveWrappingKey(string passphrase, byte[] salt, int iterations)
    {
        var passphraseBytes = Encoding.UTF8.GetBytes(passphrase);
        try
        {
            return Rfc2898DeriveBytes.Pbkdf2(
                passphraseBytes,
                salt,
                iterations,
                HashAlgorithmName.SHA256,
                KeySize);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(passphraseBytes);
        }
    }

    private static VaultCiphertext Encrypt(ReadOnlySpan<byte> key, ReadOnlySpan<byte> plaintext, ReadOnlySpan<byte> aad)
    {
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagSize];
        using var aes = new AesGcm(key, TagSize);
        aes.Encrypt(nonce, plaintext, ciphertext, tag, aad);
        return new VaultCiphertext(nonce, ciphertext, tag);
    }

    private static byte[] Decrypt(ReadOnlySpan<byte> key, byte[] nonce, byte[] ciphertext, byte[] tag, ReadOnlySpan<byte> aad)
    {
        ValidateCiphertext(new VaultCiphertext(nonce, ciphertext, tag));
        var plaintext = new byte[ciphertext.Length];
        try
        {
            using var aes = new AesGcm(key, TagSize);
            aes.Decrypt(nonce, ciphertext, tag, plaintext, aad);
            return plaintext;
        }
        catch
        {
            CryptographicOperations.ZeroMemory(plaintext);
            throw;
        }
    }

    private static byte[] ItemAad(Guid itemId)
        => Encoding.UTF8.GetBytes($"YamaSearch.PasswordVault.Item.v1:{itemId:D}");

    private static void ValidatePassphrase(string passphrase)
    {
        if (string.IsNullOrWhiteSpace(passphrase) || passphrase.Length < 12 || passphrase.Length > 1024)
            throw new ArgumentException("Synchronizační heslo musí mít alespoň 12 znaků.", nameof(passphrase));
    }

    private static void ValidateHeader(VaultHeader header)
    {
        ArgumentNullException.ThrowIfNull(header);
        if (header.Version != CurrentVersion
            || !header.Kdf.Equals("pbkdf2-sha256", StringComparison.Ordinal)
            || header.Iterations < DefaultPbkdf2Iterations
            || header.Salt.Length != SaltSize)
            throw new InvalidOperationException("Formát trezoru není podporovaný.");
        ValidateCiphertext(new VaultCiphertext(header.WrapNonce, header.WrappedKey, header.WrapTag));
        ValidateCiphertext(new VaultCiphertext(header.CheckNonce, header.CheckCiphertext, header.CheckTag));
    }

    private static void ValidateCiphertext(VaultCiphertext ciphertext)
    {
        if (ciphertext.Nonce.Length != NonceSize || ciphertext.Tag.Length != TagSize || ciphertext.Ciphertext.Length == 0)
            throw new CryptographicException("Neplatný šifrovaný záznam.");
    }
}

internal sealed record VaultHeader(
    int Version,
    string Kdf,
    int Iterations,
    byte[] Salt,
    byte[] WrapNonce,
    byte[] WrappedKey,
    byte[] WrapTag,
    byte[] CheckNonce,
    byte[] CheckCiphertext,
    byte[] CheckTag);

internal sealed record VaultCiphertext(byte[] Nonce, byte[] Ciphertext, byte[] Tag);

internal sealed class VaultKey : IDisposable
{
    private bool _disposed;
    internal byte[] Bytes { get; }

    internal VaultKey(byte[] bytes) => Bytes = bytes;

    internal void ThrowIfDisposed() => ObjectDisposedException.ThrowIf(_disposed, this);

    public void Dispose()
    {
        if (_disposed) return;
        CryptographicOperations.ZeroMemory(Bytes);
        _disposed = true;
    }
}
