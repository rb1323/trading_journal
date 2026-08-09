using System.Security.Cryptography;

namespace TradingJournal.DasSync;

internal sealed record StableFile(string Name, byte[] Content, string Sha256, DateTimeOffset LastModifiedUtc);

internal static class FileStabilityReader
{
    public static async Task<StableFile?> TryReadAsync(string path, CancellationToken cancellationToken)
    {
        try
        {
            var first = new FileInfo(path);
            if (!first.Exists || first.Length == 0) return null;
            var firstLength = first.Length;
            var firstWrite = first.LastWriteTimeUtc;
            await Task.Delay(750, cancellationToken);
            first.Refresh();
            if (!first.Exists || first.Length != firstLength || first.LastWriteTimeUtc != firstWrite) return null;

            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var memory = new MemoryStream((int)Math.Min(first.Length, int.MaxValue));
            await stream.CopyToAsync(memory, cancellationToken);
            var content = memory.ToArray();
            if (content.Length != firstLength) return null;
            var hash = Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
            return new StableFile(first.Name, content, hash, new DateTimeOffset(firstWrite, TimeSpan.Zero));
        }
        catch (OperationCanceledException) { throw; }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }
}

