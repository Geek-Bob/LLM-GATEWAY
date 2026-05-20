// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../crypto'

const SECRET = 'test-secret-key-12345'

describe('crypto utils', () => {
  it('should encrypt and decrypt a string', () => {
    const plaintext = 'Hello, World!'
    const encrypted = encrypt(plaintext, SECRET)
    expect(encrypted).toBeTruthy()
    expect(typeof encrypted).toBe('string')

    const decrypted = decrypt(encrypted, SECRET)
    expect(decrypted).toBe(plaintext)
  })

  it('should return iv:tag:ciphertext format', () => {
    const plaintext = 'test-data'
    const encrypted = encrypt(plaintext, SECRET)

    const parts = encrypted.split(':')
    expect(parts).toHaveLength(3)
    // IV should be 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32)
    // Tag should be 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32)
    // Ciphertext should be non-empty hex string
    expect(parts[2]).toBeTruthy()
    expect(/^[0-9a-f]+$/.test(parts[2])).toBe(true)
  })

  it('should produce different ciphertexts for same plaintext', () => {
    const plaintext = 'same-data'
    const result1 = encrypt(plaintext, SECRET)
    const result2 = encrypt(plaintext, SECRET)

    expect(result1).not.toBe(result2)
  })

  it('should handle empty string', () => {
    const encrypted = encrypt('', SECRET)
    const decrypted = decrypt(encrypted, SECRET)
    expect(decrypted).toBe('')
  })

  it('should handle special characters', () => {
    const plaintext = '特殊字符!@#$%^&*()\n\t'
    const encrypted = encrypt(plaintext, SECRET)
    const decrypted = decrypt(encrypted, SECRET)
    expect(decrypted).toBe(plaintext)
  })

  it('should fail to decrypt with wrong secret', () => {
    const plaintext = 'secret-message'
    const encrypted = encrypt(plaintext, SECRET)

    expect(() => decrypt(encrypted, 'wrong-secret')).toThrow()
  })

  it('should fail to decrypt with tampered ciphertext', () => {
    const plaintext = 'tamper-test'
    const encrypted = encrypt(plaintext, SECRET)

    const parts = encrypted.split(':')
    // Tamper with the ciphertext portion
    const tampered = parts[0] + ':' + parts[1] + ':' + '0000' + parts[2].slice(4)
    expect(() => decrypt(tampered, SECRET)).toThrow()
  })

  it('should throw for invalid encrypted text format', () => {
    expect(() => decrypt('invalid-format', SECRET)).toThrow()
    expect(() => decrypt('too:many:parts:here', SECRET)).toThrow()
  })
})
