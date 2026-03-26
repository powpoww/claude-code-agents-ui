<script setup lang="ts">
import type { DisplayChatMessage } from '~/types'

const props = defineProps<{
  messages: DisplayChatMessage[]
  isStreaming?: boolean
}>()

const emit = defineEmits<{
  (e: 'permissionRespond', permissionId: string, decision: 'allow' | 'deny', remember?: boolean): void
}>()

function handlePermissionRespond(permissionId: string, decision: 'allow' | 'deny', remember = false) {
  emit('permissionRespond', permissionId, decision, remember)
}
</script>

<template>
  <div class="space-y-4">
    <ChatV2MessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
      @permission-respond="handlePermissionRespond"
    />

    <!-- Streaming indicator when streaming but no text yet -->
    <div
      v-if="isStreaming && messages.length > 0 && !messages[messages.length - 1]?.isStreaming"
      class="flex items-start gap-3"
    >
      <div class="flex-1 flex flex-col items-start">
        <div
          class="px-4 py-2 rounded-lg max-w-[85%]"
          style="background: var(--surface-raised);"
        >
          <div class="flex items-center gap-2 text-[13px]" style="color: var(--text-secondary);">
            <span class="thinking-dots">
              <span>●</span><span>●</span><span>●</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thinking-dots {
  display: inline-flex;
  gap: 3px;
}

.thinking-dots span {
  animation: thinking-bounce 1.4s infinite ease-in-out both;
  font-size: 8px;
}

.thinking-dots span:nth-child(1) {
  animation-delay: -0.32s;
}

.thinking-dots span:nth-child(2) {
  animation-delay: -0.16s;
}

.thinking-dots span:nth-child(3) {
  animation-delay: 0s;
}

@keyframes thinking-bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
