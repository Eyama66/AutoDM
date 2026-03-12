import clsx from 'clsx'
import { MESSAGE_SOURCE } from '../gameUiUtils'

function isSystemBubble(message) {
  return (
    message?.meta?.source === MESSAGE_SOURCE.SYSTEM_CHECK ||
    message?.meta?.source === MESSAGE_SOURCE.SYSTEM_ROLL ||
    message?.meta?.source === MESSAGE_SOURCE.SYSTEM_DIRECTIVE
  )
}

export function UserMessageBubble({ message }) {
  const systemBubble = isSystemBubble(message)

  return (
    <div
      className={clsx(
        'message-bubble',
        systemBubble ? 'message-bubble--system' : 'message-bubble--user',
      )}
      data-testid={systemBubble ? 'system-message-bubble' : 'user-message-bubble'}
    >
      <p
        className={clsx(
          'message-bubble__content whitespace-pre-wrap',
          systemBubble ? 'message-bubble__content--system' : 'message-bubble__content--user',
        )}
      >
        {systemBubble ? message.content : `“${message.content}”`}
      </p>
    </div>
  )
}
