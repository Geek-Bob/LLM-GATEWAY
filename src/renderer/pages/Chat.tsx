/**
 * Chat 页面 — 多 LLM 供应商对话界面
 *
 * 纯 JSX 组装层，所有业务逻辑由 useChatPage hook 封装。
 * 子组件：ConversationSidebar、ChatToolbar、MessageList、ChatInputArea。
 */

import { motion } from 'framer-motion'
import { pageVariants, childVariants } from '@/lib/animations'
import { useChatPage } from '@/features/chat/hooks/useChatPage'
import { ConversationSidebar } from '@/features/chat/components/ConversationSidebar'
import { ChatToolbar } from '@/features/chat/components/ChatToolbar'
import { MessageList } from '@/features/chat/components/MessageList'
import { ChatInputArea } from '@/features/chat/components/ChatInputArea'
import { ThinkingSettings } from '@/features/chat/components/ThinkingSettings'

/** Chat 页面，多 LLM 供应商对话界面的纯 JSX 组装层。 @returns Chat 页面 JSX。 */
export function ChatPage() {
  const {
    conversations,
    messages,
    messagesEndRef,
    activeConversationId,
    selectedProviderId,
    setSelectedProviderId,
    selectedModel,
    setSelectedModel,
    selectedApiKeyId,
    setSelectedApiKeyId,
    providerOptions,
    availableModels,
    keyOptions,
    thinkingType,
    reasoningEffort,
    onThinkingTypeChange,
    onReasoningEffortChange,
    sidebarCollapsed,
    toggleSidebar,
    inputKey,
    streamLoading: isStreamLoading,
    handleSend,
    handleStop,
    handleRegenerate,
    handleSelectConversation,
    handleNewConversation,
    handleDeleteConversation,
  } = useChatPage()

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="show"
      className="flex h-full"
    >
      <motion.div variants={childVariants} className="contents">
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
      </motion.div>

      <motion.div variants={childVariants} className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center h-12 px-3 gap-2 border-b border-border/50">
          <ChatToolbar
            providers={providerOptions}
            selectedProviderId={selectedProviderId}
            onSelectProvider={(id) => { setSelectedProviderId(id); if (id === null) setSelectedModel(null) }}
            availableModels={availableModels}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            apiKeys={keyOptions}
            selectedApiKeyId={selectedApiKeyId}
            onSelectApiKey={setSelectedApiKeyId}
          />

          <div className="h-4 w-px bg-border/50 mx-1" />

          <ThinkingSettings
            thinkingType={thinkingType}
            reasoningEffort={reasoningEffort}
            onThinkingTypeChange={onThinkingTypeChange}
            onReasoningEffortChange={onReasoningEffortChange}
          />
        </div>

        <MessageList messages={messages} onRegenerate={handleRegenerate} messagesEndRef={messagesEndRef} />

        <ChatInputArea
          inputKey={inputKey}
          isStreamLoading={isStreamLoading}
          selectedModel={selectedModel}
          selectedApiKeyId={selectedApiKeyId}
          onSend={handleSend}
          onStop={handleStop}
        />
      </motion.div>
    </motion.div>
  )
}
