using System.Security.Cryptography;
using TradingJournal.DasSync;
using Xunit;

namespace TradingJournal.DasSyncAgent.Tests;

public sealed class FileStabilityReaderTests
{
    [Fact]
    public async Task ReadsStableFileWithMatchingHash()
    {
        var directory = Path.Combine(Path.GetTempPath(), "trading-journal-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "Trades.csv");
        var bytes = "TradeID,Account\r\n1,A\r\n"u8.ToArray();
        await File.WriteAllBytesAsync(path, bytes);
        try
        {
            var result = await FileStabilityReader.TryReadAsync(path, CancellationToken.None);
            Assert.NotNull(result);
            Assert.Equal("Trades.csv", result.Name);
            Assert.Equal(Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), result.Sha256);
            Assert.Equal(bytes, result.Content);
        }
        finally
        {
            Directory.Delete(directory, true);
        }
    }

    [Fact]
    public async Task EmptyFileIsNotStableSnapshot()
    {
        var path = Path.GetTempFileName();
        try { Assert.Null(await FileStabilityReader.TryReadAsync(path, CancellationToken.None)); }
        finally { File.Delete(path); }
    }
}
