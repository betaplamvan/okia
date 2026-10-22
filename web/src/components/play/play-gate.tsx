"use client";

import { Button, Container, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { LuSwords, LuX } from "react-icons/lu";
import { PlayScreen } from "@/components/play/play-screen";
import { Link } from "@/i18n/navigation";
import { isActive, useMatchmaking } from "@/stores/matchmaking";

// Đang tìm trận xếp hạng thì khóa chơi với máy (docs/07): ghép được là hộp chấp nhận bật lên và
// vào phòng, ván với máy đang dở sẽ bị bỏ — nên không cho bắt đầu. Hủy tìm ngay tại đây được.
export function PlayGate() {
  const t = useTranslations("Ranked");
  const search = useMatchmaking((s) => s.search);
  const cancel = useMatchmaking((s) => s.cancel);
  if (!isActive(search)) return <PlayScreen />;
  return (
    <Container maxW="md" px={4} py={{ base: 6, md: 10 }} flex="1">
      <Stack layerStyle="sticker" p={5} gap={3} color="ink" data-testid="play-locked">
        <Heading size="xl">{t("lockedTitle")}</Heading>
        <Text>{t("lockedBody")}</Text>
        <HStack flexWrap="wrap">
          <Button asChild variant="sticker" bg="sun" data-sfx="open">
            <Link href="/ranked">
              <LuSwords /> {t("lockedBack")}
            </Link>
          </Button>
          <Button variant="sticker" bg="coral" onClick={cancel} data-sfx="back">
            <LuX /> {t("cancel")}
          </Button>
        </HStack>
      </Stack>
    </Container>
  );
}
