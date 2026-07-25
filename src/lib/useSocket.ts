import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io, Socket } from 'socket.io-client'

const SOCKET_URL = (typeof import.meta !== 'undefined' && import.meta.env?.PROD)
  ? 'https://apex-racing-clean-production.up.railway.app'
  : 'http://localhost:3000'

export function useSocketLiveUpdate(queryKeys: string[]) {
  const queryClient = useQueryClient()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['polling'],
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: 200,
    })
    socketRef.current = socket

    socket.on('live-update', () => {
      for (const key of queryKeys) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [queryClient, queryKeys.join(',')])
}
