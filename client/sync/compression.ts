import * as fflate from 'fflate'

/**
 * Compression Abstraction
 * Supports native CompressionStream and fflate fallback.
 */
export class CompressionService {
  /**
   * Compresses data using native stream if available, otherwise falls back to fflate.
   * Time Complexity: O(N) where N is data length
   * Space Complexity: O(N) allocated for compressed buffer
   */
  static async compress(data: Uint8Array): Promise<Uint8Array> {
    if (typeof CompressionStream !== 'undefined') {
      const stream = new CompressionStream('gzip')
      const writer = stream.writable.getWriter()
      writer.write(data as any)
      writer.close()
      const response = new Response(stream.readable)
      const arrayBuffer = await response.arrayBuffer()
      return new Uint8Array(arrayBuffer)
    } else {
      return new Promise((resolve, reject) => {
        fflate.gzip(data, (err, dat) => {
          if (err) reject(err)
          else resolve(dat)
        })
      })
    }
  }

  /**
   * Decompresses data using native stream if available, otherwise falls back to fflate.
   * Time Complexity: O(N) where N is compressed data length
   * Space Complexity: O(M) where M is decompressed buffer size
   */
  static async decompress(data: Uint8Array): Promise<Uint8Array> {
    if (typeof DecompressionStream !== 'undefined') {
      const stream = new DecompressionStream('gzip')
      const writer = stream.writable.getWriter()
      writer.write(data as any)
      writer.close()
      const response = new Response(stream.readable)
      const arrayBuffer = await response.arrayBuffer()
      return new Uint8Array(arrayBuffer)
    } else {
      return new Promise((resolve, reject) => {
        fflate.gunzip(data, (err, dat) => {
          if (err) reject(err)
          else resolve(dat)
        })
      })
    }
  }
}
