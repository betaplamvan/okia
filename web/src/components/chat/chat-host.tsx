"use client";

import { Avatar, Box, Button, HStack, IconButton, Stack, Text, Textarea } from "@chakra-ui/react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  LuLock,
  LuMaximize2,
  LuMessageCircle,
  LuMinimize2,
  LuReply,
  LuSendHorizontal,
  LuX,
} from "react-icons/lu";
import { BronzeDrum } from "@/components/donate/bronze-drum";
import { RankEmblem } from "@/components/ranked/rank-emblem";
import { useRankLabel } from "@/components/ranked/tier-badge";
import { toaster } from "@/components/ui/toaster";
import type { ChatMessageOut } from "@/game/ws-types";
import { usePathname } from "@/i18n/navigation";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useChat } from "@/stores/chat";

/** Hỏi số online / tin mới mỗi chừng này (chỉ khi tab đang hiện). */
const META_MS = 30_000;
const MAX_LEN = 300;
/** Tin liên tiếp của cùng người trong khoảng này gộp nhóm (ẩn avatar + tên). */
const GROUP_MS = 2 * 60_000;

/**
 * Chat tổng (docs/15): bong bóng góc dưới phải (đếm tin chưa đọc + số người online) mở khung chat
 * chung. Khách đọc được, tài khoản Google mới gửi. Hiện ở MỌI trang (2026-10-23; trước đó ẩn ở màn
 * chơi — người chơi tưởng mất); trong màn chơi (/play, /r/…) bong bóng nhỏ hơn để không che nút.
 */
export function ChatHost() {
  const pathname = usePathname();
  const status = useAuth((s) => s.status);
  const open = useChat((s) => s.open);
  const refreshMeta = useChat((s) => s.refreshMeta);
  const inGame = pathname === "/play" || pathname.startsWith("/r/");

  useEffect(() => {
    if (status !== "ready") return;
    void refreshMeta();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refreshMeta();
    }, META_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshMeta();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, refreshMeta]);

  // Vào màn chơi → đóng khung đang mở (ngừng nhận tin), bong bóng vẫn còn.
  useEffect(() => {
    if (inGame) useChat.getState().setOpen(false);
  }, [inGame]);

  return (
    <>
      {open ? <ChatPanel /> : null}
      <ChatBubble compact={inGame} />
    </>
  );
}

function OnlinePill({ n }: { n: number }) {
  const format = useFormatter();
  return (
    <HStack
      as="span"
      gap={1}
      bg="paper"
      color="ink"
      border="2px solid"
      borderColor="ink"
      borderRadius="full"
      px={2}
      fontSize="xs"
      fontWeight="700"
      lineHeight="1.4"
      fontVariantNumeric="tabular-nums"
    >
      <Box as="span" w="8px" h="8px" borderRadius="full" bg="#2fbf71" border="1.5px solid" />
      {format.number(n)}
    </HStack>
  );
}

function ChatBubble({ compact }: { compact: boolean }) {
  const t = useTranslations("Chat");
  const open = useChat((s) => s.open);
  const online = useChat((s) => s.online);
  const unread = useChat((s) =>
    s.seenId === null || s.open ? 0 : Math.max(0, s.lastId - s.seenId),
  );
  const setOpen = useChat((s) => s.setOpen);
  return (
    <Box
      position="fixed"
      right={{ base: 3, md: 5 }}
      bottom={{ base: 3, md: 5 }}
      zIndex={20}
      data-testid="chat-bubble-wrap"
    >
      <IconButton
        aria-label={open ? t("close") : t("open")}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        variant="sticker"
        bg="mint"
        w={compact ? "44px" : { base: "56px", md: "64px" }}
        h={compact ? "44px" : { base: "56px", md: "64px" }}
        borderRadius="full"
        fontSize={compact ? "22px" : { base: "26px", md: "30px" }}
        data-sfx={open ? "back" : "open"}
        data-testid="chat-bubble"
      >
        {open ? <LuX /> : <LuMessageCircle />}
      </IconButton>
      {unread > 0 ? (
        <Box
          position="absolute"
          top="-6px"
          right="-6px"
          minW="24px"
          h="24px"
          px={1}
          bg="coral"
          color="ink"
          border="2px solid"
          borderColor="ink"
          borderRadius="full"
          fontSize="xs"
          fontWeight="700"
          display="flex"
          alignItems="center"
          justifyContent="center"
          pointerEvents="none"
          aria-label={t("unread", { n: String(unread) })}
          data-testid="chat-unread"
        >
          {unread > 99 ? "99+" : unread}
        </Box>
      ) : null}
      {online > 0 && !compact ? (
        <Box
          position="absolute"
          bottom="-8px"
          left="50%"
          transform="translateX(-50%)"
          pointerEvents="none"
          title={t("online", { n: String(online) })}
        >
          <OnlinePill n={online} />
        </Box>
      ) : null}
    </Box>
  );
}

function ChatPanel() {
  const t = useTranslations("Chat");
  const expanded = useChat((s) => s.expanded);
  const online = useChat((s) => s.online);
  const toggleExpanded = useChat((s) => s.toggleExpanded);
  const setOpen = useChat((s) => s.setOpen);

  // Esc đóng khung.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <Stack
      role="dialog"
      aria-label={t("title")}
      position="fixed"
      right={{ base: 2, md: 5 }}
      bottom={{ base: "80px", md: "96px" }}
      zIndex={20}
      w={{ base: "calc(100vw - 16px)", sm: expanded ? "640px" : "400px" }}
      h={{
        base: "min(72dvh, 620px)",
        md: expanded ? "min(80dvh, 780px)" : "min(70dvh, 600px)",
      }}
      layerStyle="sticker"
      bg="cream"
      p={0}
      gap={0}
      overflow="hidden"
      data-testid="chat-panel"
    >
      <HStack px={3} py={2} gap={2} bg="mint" borderBottom="2px solid" borderColor="ink">
        <Box
          display="flex"
          bg="paper"
          border="2px solid"
          borderColor="ink"
          borderRadius="full"
          p={1.5}
          fontSize="lg"
        >
          <LuMessageCircle />
        </Box>
        <Text fontWeight="700" fontSize="lg" lineHeight="1.1">
          {t("title")}
        </Text>
        <Box title={t("online", { n: String(online) })}>
          <OnlinePill n={online} />
        </Box>
        <Box flex="1" />
        <IconButton
          aria-label={expanded ? t("shrink") : t("expand")}
          variant="sticker"
          size="sm"
          bg="paper"
          borderRadius="full"
          display={{ base: "none", sm: "inline-flex" }}
          onClick={toggleExpanded}
        >
          {expanded ? <LuMinimize2 /> : <LuMaximize2 />}
        </IconButton>
        <IconButton
          aria-label={t("close")}
          variant="sticker"
          size="sm"
          bg="paper"
          borderRadius="full"
          onClick={() => setOpen(false)}
          data-sfx="back"
          data-testid="chat-close"
        >
          <LuX />
        </IconButton>
      </HStack>
      <MessageList />
      <Composer />
    </Stack>
  );
}

function MessageList() {
  const t = useTranslations("Chat");
  const messages = useChat((s) => s.messages);
  const hasMore = useChat((s) => s.hasMore);
  const loading = useChat((s) => s.loading);
  const loaded = useChat((s) => s.loaded);
  const error = useChat((s) => s.error);
  const loadOlder = useChat((s) => s.loadOlder);
  const me = useAuth((s) => s.user);
  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevFirst = useRef<number | null>(null);
  const prevHeight = useRef(0);

  // Tin mới: đang ở đáy thì cuộn theo; tải tin cũ (đầu danh sách đổi) thì giữ nguyên chỗ đang đọc.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = messages[0]?.id ?? null;
    if (prevFirst.current !== null && first !== null && first < prevFirst.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevFirst.current = first;
    prevHeight.current = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    prevHeight.current = el.scrollHeight;
    if (el.scrollTop < 40 && hasMore && !loading) void loadOlder();
  };

  return (
    <Stack
      ref={ref}
      flex="1"
      minH={0}
      overflowY="auto"
      px={3}
      py={3}
      gap={1}
      onScroll={onScroll}
      aria-live="polite"
      data-testid="chat-messages"
    >
      {hasMore ? (
        <Button
          variant="ghost"
          size="xs"
          alignSelf="center"
          loading={loading}
          onClick={() => void loadOlder()}
        >
          {t("loadOlder")}
        </Button>
      ) : null}
      {loaded && messages.length === 0 ? (
        <Text textAlign="center" opacity={0.7} py={8} fontSize="sm">
          {t("empty")}
        </Text>
      ) : null}
      {error && messages.length === 0 ? (
        <Text textAlign="center" color="coral" py={8} fontSize="sm">
          {t("loadError")}
        </Text>
      ) : null}
      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const grouped =
          !!prev &&
          prev.userId === msg.userId &&
          !msg.reply &&
          Date.parse(msg.createdAt) - Date.parse(prev.createdAt) < GROUP_MS;
        return (
          <MessageRow
            key={msg.id}
            msg={msg}
            grouped={grouped}
            mine={me?.id === msg.userId}
            canReply={!!me && !me.isGuest}
          />
        );
      })}
    </Stack>
  );
}

function MessageRow({
  msg,
  grouped,
  mine,
  canReply,
}: {
  msg: ChatMessageOut;
  grouped: boolean;
  mine: boolean;
  canReply: boolean;
}) {
  const t = useTranslations("Chat");
  const format = useFormatter();
  const rankLabel = useRankLabel();
  const setReply = useChat((s) => s.setReply);
  const at = new Date(msg.createdAt);
  const today = new Date().toDateString() === at.toDateString();
  const time = format.dateTime(
    at,
    today
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" },
  );
  return (
    <HStack
      align="flex-start"
      gap={2}
      mt={grouped ? 0 : 2}
      className="group"
      data-testid="chat-row"
    >
      <Box w="36px" flexShrink={0}>
        {grouped ? null : (
          <Avatar.Root size="sm" bg={mine ? "sun" : "mint"} color="ink" border="2px solid">
            <Avatar.Fallback name={msg.name} fontWeight="700" />
            {msg.avatarUrl ? <Avatar.Image src={msg.avatarUrl} alt="" /> : null}
          </Avatar.Root>
        )}
      </Box>
      <Stack gap={1} minW={0} flex="1">
        {grouped ? null : (
          <HStack gap={1.5} minW={0}>
            <Text fontWeight="700" fontSize="sm" truncate>
              {msg.name}
            </Text>
            {msg.rank ? (
              <Box title={rankLabel(msg.rank)} display="flex">
                <RankEmblem rank={msg.rank} size={16} animate={false} label={rankLabel(msg.rank)} />
              </Box>
            ) : null}
            {msg.donor ? (
              <Box title={t("donor")} display="flex">
                <BronzeDrum size={16} />
              </Box>
            ) : null}
            <Text fontSize="xs" opacity={0.6} flexShrink={0}>
              {time}
            </Text>
          </HStack>
        )}
        {msg.reply ? (
          <Box
            borderLeft="3px solid"
            borderColor="ink"
            bg="paper"
            borderRadius="sm"
            px={2}
            py={0.5}
            fontSize="xs"
            opacity={0.85}
            maxW="full"
          >
            <Text as="span" fontWeight="700">
              {msg.reply.name}
            </Text>{" "}
            <Text as="span" fontStyle={msg.reply.deleted ? "italic" : undefined}>
              {msg.reply.deleted ? t("deleted") : msg.reply.body}
            </Text>
          </Box>
        ) : null}
        <HStack gap={1} align="center" minW={0}>
          <Box
            bg={mine ? "sun" : "paper"}
            border="2px solid"
            borderColor="ink"
            borderRadius="lg"
            px={3}
            py={1}
            whiteSpace="pre-wrap"
            wordBreak="break-word"
            maxW="full"
            data-testid="chat-body"
          >
            {msg.body}
          </Box>
          {canReply ? (
            <IconButton
              aria-label={t("reply")}
              title={t("reply")}
              variant="ghost"
              size="2xs"
              flexShrink={0}
              opacity={{ base: 0.6, md: 0 }}
              _groupHover={{ opacity: 0.8 }}
              _focusVisible={{ opacity: 1 }}
              onClick={() => setReply(msg)}
              data-testid="chat-reply"
            >
              <LuReply />
            </IconButton>
          ) : null}
        </HStack>
      </Stack>
    </HStack>
  );
}

function Composer() {
  const t = useTranslations("Chat");
  const user = useAuth((s) => s.user);
  const chatEnabled = useAuth((s) => s.site.chatEnabled);
  const openProfile = useAuth((s) => s.openProfile);
  const replyTo = useChat((s) => s.replyTo);
  const setReply = useChat((s) => s.setReply);
  const send = useChat((s) => s.send);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  if (!chatEnabled) {
    return (
      <HStack
        px={3}
        py={2.5}
        gap={2}
        borderTop="2px solid"
        borderColor="ink"
        bg="paper"
        data-testid="chat-disabled"
      >
        <LuLock />
        <Text fontSize="sm" flex="1">
          {t("disabled")}
        </Text>
      </HStack>
    );
  }
  if (!user || user.isGuest) {
    return (
      <HStack
        px={3}
        py={2.5}
        gap={2}
        borderTop="2px solid"
        borderColor="ink"
        bg="paper"
        data-testid="chat-locked"
      >
        <LuLock />
        <Text fontSize="sm" flex="1">
          {t("guestLocked")}
        </Text>
        <Button
          variant="sticker"
          size="xs"
          bg="mint"
          onClick={() => openProfile("account")}
          data-sfx="open"
        >
          {t("signIn")}
        </Button>
      </HStack>
    );
  }

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await send(body);
      setText("");
    } catch (e) {
      toaster.error({ title: e instanceof ApiError ? e.message || e.code : String(e) });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <Stack gap={1.5} px={3} py={2} borderTop="2px solid" borderColor="ink" bg="paper">
      {replyTo ? (
        <HStack
          gap={2}
          fontSize="xs"
          bg="cream"
          border="2px solid"
          borderColor="ink"
          borderRadius="md"
          px={2}
          py={1}
          data-testid="chat-replying"
        >
          <LuReply />
          <Text flex="1" truncate>
            <Text as="span" fontWeight="700">
              {t("replyingTo", { name: replyTo.name })}
            </Text>{" "}
            {replyTo.body}
          </Text>
          <IconButton
            aria-label={t("cancelReply")}
            variant="ghost"
            size="2xs"
            onClick={() => setReply(null)}
          >
            <LuX />
          </IconButton>
        </HStack>
      ) : null}
      <HStack gap={2} align="flex-end">
        <Textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter gửi, Shift+Enter xuống dòng; bỏ qua khi bộ gõ tiếng Việt đang ghép chữ.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={t("placeholder")}
          maxLength={MAX_LEN}
          rows={1}
          autoresize
          maxH="96px"
          resize="none"
          bg="cream"
          border="2px solid"
          borderColor="ink"
          borderRadius="lg"
          fontSize="md"
          data-testid="chat-input"
        />
        <IconButton
          aria-label={t("send")}
          variant="sticker"
          bg="mint"
          borderRadius="full"
          loading={sending}
          disabled={!text.trim()}
          onClick={() => void submit()}
          data-sfx="confirm"
          data-testid="chat-send"
        >
          <LuSendHorizontal />
        </IconButton>
      </HStack>
      {text.length > MAX_LEN - 50 ? (
        <Text fontSize="xs" opacity={0.7} textAlign="right">
          {text.length}/{MAX_LEN}
        </Text>
      ) : null}
    </Stack>
  );
}
