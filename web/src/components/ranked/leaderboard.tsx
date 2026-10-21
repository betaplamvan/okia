"use client";

import { Avatar, Box, Button, Container, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { LuRefreshCw, LuSwords } from "react-icons/lu";
import { TierBadge } from "@/components/ranked/tier-badge";
import { Link } from "@/i18n/navigation";
import type { LeaderboardEntry, LeaderboardOut } from "@/lib/api";
import { useAuth } from "@/stores/auth";

const MEDAL = ["sun", "paper", "pink"] as const;

// Bảng xếp hạng /leaderboard (P2-09): top 100 theo điểm hạng; dòng của tôi ghim cuối nếu ngoài top.
export function Leaderboard() {
  const t = useTranslations("Leaderboard");
  const tr = useTranslations("Ranked");
  const locale = useLocale();
  const format = useFormatter();
  const authed = useAuth((s) => s.authed);
  const user = useAuth((s) => s.user);
  const [data, setData] = useState<LeaderboardOut | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(() => authed<LeaderboardOut>("/leaderboard"), [authed]);

  // Tải khi đã biết người dùng (để có dòng "của tôi"); chưa đăng nhập xong vẫn tải được (public).
  useEffect(() => {
    let alive = true;
    fetchData()
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [fetchData, user?.id]);

  async function load() {
    setBusy(true);
    setError(false);
    try {
      setData(await fetchData());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const seasonName = data ? (locale === "en" ? data.season.name.en : data.season.name.vi) : "";
  const inTop = !!data?.me && data.entries.some((e) => e.userId === data.me!.userId);

  return (
    <Container maxW="3xl" px={4} py={{ base: 4, md: 6 }} flex="1">
      <Stack gap={{ base: 4, md: 5 }}>
        <Stack gap={1}>
          <Heading size="3xl" color="cream" textShadow="stickerText" textAlign="center">
            {t("title")}
          </Heading>
          <Text textAlign="center" color="cream" opacity={0.9}>
            {t("intro")}
          </Text>
          {data ? (
            <Text textAlign="center" color="cream" opacity={0.75} fontSize="sm">
              {tr("season", { name: seasonName })} ·{" "}
              {t("endsAt", { date: format.dateTime(new Date(data.season.endsAt), "short") })}
            </Text>
          ) : null}
        </Stack>

        <Stack layerStyle="sticker" p={{ base: 3, md: 5 }} gap={2}>
          {error ? (
            <Stack align="center" gap={2}>
              <Text>{tr("loadError")}</Text>
              <Button variant="sticker" size="sm" onClick={load} loading={busy}>
                <LuRefreshCw /> {t("refresh")}
              </Button>
            </Stack>
          ) : !data ? (
            <Text textAlign="center">{t("loading")}</Text>
          ) : data.entries.length === 0 ? (
            <Stack align="center" gap={3} py={4}>
              <Text textAlign="center">{t("empty", { n: String(data.placementGames) })}</Text>
              <Button asChild variant="sticker" bg="coral">
                <Link href="/ranked">
                  <LuSwords /> {t("play")}
                </Link>
              </Button>
            </Stack>
          ) : (
            <Stack gap={1.5} data-testid="leaderboard">
              {data.entries.map((e) => (
                <Row key={e.userId} e={e} me={e.userId === user?.id} />
              ))}
            </Stack>
          )}
          {data?.me && !inTop ? (
            <Stack gap={1} mt={2}>
              <Text fontSize="sm" fontWeight="700" opacity={0.8}>
                {t("me")}
              </Text>
              <Row e={data.me} me />
            </Stack>
          ) : null}
        </Stack>

        <HStack justify="center" gap={2} hidden={!data || data.entries.length === 0}>
          <Button asChild variant="sticker" bg="coral">
            <Link href="/ranked">
              <LuSwords /> {t("play")}
            </Link>
          </Button>
          <Button
            variant="sticker"
            size="sm"
            onClick={load}
            loading={busy}
            aria-label={t("refresh")}
          >
            <LuRefreshCw />
          </Button>
        </HStack>
      </Stack>
    </Container>
  );
}

function Row({ e, me }: { e: LeaderboardEntry; me?: boolean }) {
  const t = useTranslations("Leaderboard");
  const format = useFormatter();
  const medal = e.position <= 3 ? MEDAL[e.position - 1] : null;
  return (
    <HStack
      gap={{ base: 2, md: 3 }}
      bg={me ? "mint" : (medal ?? "paper")}
      border="2px solid"
      borderColor="ink"
      borderRadius="md"
      px={{ base: 2, md: 3 }}
      py={1.5}
      boxShadow={me ? "stickerSm" : undefined}
      data-testid={me ? "lb-me" : undefined}
    >
      <Text fontWeight="700" fontSize="lg" minW="8" textAlign="center">
        {e.position}
      </Text>
      <Avatar.Root size="sm" bg="sun" color="ink" border="2px solid" borderColor="ink">
        <Avatar.Fallback name={e.name} fontWeight="700" />
        {e.avatarUrl ? <Avatar.Image src={e.avatarUrl} /> : null}
      </Avatar.Root>
      <Stack gap={0} minW={0} flex="1">
        <HStack gap={2} minW={0}>
          <Text fontWeight="700" truncate title={e.name}>
            {e.name}
          </Text>
          {me ? (
            <Text as="span" fontSize="xs" opacity={0.8}>
              ({t("you")})
            </Text>
          ) : null}
        </HStack>
        <HStack gap={2} fontSize="xs" opacity={0.8} flexWrap="wrap">
          <Box display={{ base: "none", sm: "block" }}>
            <TierBadge rank={e.rank} size="sm" />
          </Box>
          <Text as="span">
            {t("games", { n: String(e.games) })} · {t("wins", { n: String(e.wins) })}
          </Text>
        </HStack>
      </Stack>
      <Text fontWeight="700" fontSize="xl" minW="12" textAlign="right">
        {format.number(e.rank.points)}
      </Text>
    </HStack>
  );
}
