/**
 * React Hook for E2EE Chat
 * 
 * Handles key initialization, message encryption/decryption,
 * and public key synchronization with the server.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
    ensureKeyPair,
    getOrDeriveConversationKey,
    encryptMessage,
    decryptMessage,
    clearKeyCache,
    type E2EEKeyPair
} from '../e2ee'
import {
    uploadPublicKey,
    fetchPublicKey,
    fetchMyPublicKey
} from '../api'
import type { Message } from '../types'

interface UseE2EEResult {
    isInitialized: boolean
    isEnabled: boolean
    error: string | null

    // Encrypt a message before sending
    encryptForRecipient: (recipientUsername: string, plaintext: string) => Promise<string | null>

    // Decrypt a received message
    decryptFromSender: (senderUsername: string, encryptedContent: string) => Promise<string | null>

    // Process a message for display (decrypts if needed or returns content)
    processMessageForDisplay: (message: Message, senderUsername: string) => Promise<string>
}

export function useE2EE(): UseE2EEResult {
    const [isInitialized, setIsInitialized] = useState(false)
    const [isEnabled, setIsEnabled] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Store key pair in ref to avoid re-renders
    const keyPairRef = useRef<E2EEKeyPair | null>(null)

    // Cache for recipient public keys
    const publicKeyCache = useRef<Map<string, string>>(new Map())

    // Initialize E2EE on mount
    useEffect(() => {
        const initE2EE = async () => {
            try {
                // Check if Web Crypto API is available
                if (!crypto?.subtle) {
                    console.warn('[E2EE] Web Crypto API not available')
                    setIsInitialized(true)
                    setIsEnabled(false)
                    return
                }

                // Ensure we have a key pair (generate if needed)
                const { keyPair, publicKeyBase64, isNew } = await ensureKeyPair()
                keyPairRef.current = keyPair

                // Check if our public key is on the server
                const serverKey = await fetchMyPublicKey()

                // Upload if new or doesn't match
                if (isNew || !serverKey || serverKey.public_key !== publicKeyBase64) {
                    console.log('[E2EE] Uploading public key to server...')
                    await uploadPublicKey(publicKeyBase64)
                    console.log('[E2EE] Public key uploaded')
                }

                setIsEnabled(true)
                setIsInitialized(true)
                console.log('[E2EE] Initialized successfully')
            } catch (err) {
                console.error('[E2EE] Initialization failed:', err)
                setError('E2EE initialization failed')
                setIsInitialized(true)
                setIsEnabled(false)
            }
        }

        initE2EE()

        // Cleanup: clear key cache on unmount
        return () => {
            clearKeyCache()
        }
    }, [])

    /**
     * Get or fetch a user's public key
     */
    const getRecipientPublicKey = useCallback(async (username: string): Promise<string | null> => {
        // Check cache first
        if (publicKeyCache.current.has(username)) {
            return publicKeyCache.current.get(username)!
        }

        try {
            const data = await fetchPublicKey(username)
            publicKeyCache.current.set(username, data.public_key)
            return data.public_key
        } catch (err) {
            console.warn(`[E2EE] Failed to fetch public key for ${username}:`, err)
            return null
        }
    }, [])

    /**
     * Encrypt a message for a specific recipient
     */
    const encryptForRecipient = useCallback(async (
        recipientUsername: string,
        plaintext: string
    ): Promise<string | null> => {
        if (!isEnabled || !keyPairRef.current) {
            console.warn('[E2EE] Not enabled, returning plaintext')
            return null
        }

        try {
            // Get recipient's public key
            const recipientPublicKey = await getRecipientPublicKey(recipientUsername)
            if (!recipientPublicKey) {
                console.warn(`[E2EE] No public key for ${recipientUsername}, sending unencrypted`)
                return null
            }

            // Derive shared conversation key
            const conversationKey = await getOrDeriveConversationKey(
                keyPairRef.current.privateKey,
                recipientPublicKey
            )

            // Encrypt the message
            const encrypted = await encryptMessage(conversationKey, plaintext)
            console.log('[E2EE] Message encrypted successfully')

            return encrypted
        } catch (err) {
            console.error('[E2EE] Encryption failed:', err)
            return null
        }
    }, [isEnabled, getRecipientPublicKey])

    /**
     * Decrypt a message from a specific sender
     */
    const decryptFromSender = useCallback(async (
        senderUsername: string,
        encryptedContent: string
    ): Promise<string | null> => {
        if (!isEnabled || !keyPairRef.current) {
            console.warn('[E2EE] Not enabled, cannot decrypt')
            return null
        }

        try {
            // Get sender's public key
            const senderPublicKey = await getRecipientPublicKey(senderUsername)
            if (!senderPublicKey) {
                console.warn(`[E2EE] No public key for ${senderUsername}, cannot decrypt`)
                return null
            }

            // Derive shared conversation key (same key due to ECDH symmetry)
            const conversationKey = await getOrDeriveConversationKey(
                keyPairRef.current.privateKey,
                senderPublicKey
            )

            // Decrypt the message
            const decrypted = await decryptMessage(conversationKey, encryptedContent)
            return decrypted
        } catch (err) {
            console.error('[E2EE] Decryption failed:', err)
            return null
        }
    }, [isEnabled, getRecipientPublicKey])

    /**
     * Process a message for display
     * Decrypts if encrypted, otherwise returns content as-is
     */
    const processMessageForDisplay = useCallback(async (
        message: Message,
        senderUsername: string
    ): Promise<string> => {
        // If not encrypted, return content as-is
        if (!message.is_encrypted) {
            return message.content
        }

        // If unsent, show placeholder
        if (message.is_unsent) {
            return '[Message unsent]'
        }

        // Try to decrypt
        const decrypted = await decryptFromSender(senderUsername, message.content)
        if (decrypted !== null) {
            return decrypted
        }

        // Decryption failed, show error
        return 'This message can\u2019t be decrypted on this device.'
    }, [decryptFromSender])

    return {
        isInitialized,
        isEnabled,
        error,
        encryptForRecipient,
        decryptFromSender,
        processMessageForDisplay
    }
}
