"use client";

import {
  Button,
  CloseButton,
  Container,
  Dialog,
  Heading,
  HStack,
  Portal,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { RewardChips, useRewardLabel, WalletChips } from "@/components/economy/wallet-chips";
import { SkinCard, useSkinName } from "@/components/shop/skin-card";
import { TryDialog } from "@/components/shop/try-dialog";
import { toaster } from "@/components/ui/toaster";
import { audio } from "@/game/audio/audio-manager";
import {
  BOXES,
  PENS,
  RARITIES,
  RARITY_PRICE,
  type SkinManifest,
  type SkinType,
} from "@/game/skins/skins";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

// Cửa hàng /shop (docs/06 — Shop, ADR-0013): hai tab Bút / Ô, lưới 2 cột trên điện thoại, ví ở đầu,
// Thử (bàn mẫu) / Mua (xác nhận) / Trang bị. Khách xem và thử được, mua thì mời đăng nhập Google.
export function ShopScreen() {
  const t = useTranslations("Shop");
  const user = useAuth((s) => s.user);
  const skins = useAuth((s) => s.skins);
  const loadSkins = useAuth((s) => s.loadSkins);
  const buySkin = useAuth((s) => s.buySkin);
  const equipSkin = useAuth((s) => s.equipSkin);
  const openProfile = useAuth((s) => s.openProfile);
  const skinName = useSkinName();
  const rewardLabel = useRewardLabel();
  const [tab, setTab] = useState<SkinType>("pen");
  const [trying, setTrying] = useState<SkinManifest | null>(null);
  const [confirm, setConfirm] = useState<SkinManifest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (user) void loadSkins();
  }, [user, loadSkins]);

  const owned = new Set(skins?.owned ?? []);
  const loadout = skins?.loadout ?? user?.loadout;
  const canBuy = !!skins?.canBuy;
  const list = (tab === "pen" ? PENS : BOXES) as readonly SkinManifest[];
  // Sắp theo bậc tăng dần, default trước.
  const sorted = [...list].sort(
    (a, b) =>
      Number(!!b.default) - Number(!!a.default) ||
      RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity),
  );

  async function doBuy(skin: SkinManifest) {
    setBusy(skin.id);
    try {
      await buySkin(skin.id);
      toaster.success({ title: t("bought", { name: skinName(skin) }) });
      setConfirm(null);
    } catch (e) {
      audio.playUi("error");
      toaster.error({
        title:
          e instanceof ApiError && e.code === "INSUFFICIENT_FUNDS"
            ? t("notEnough")
            : e instanceof ApiError && e.message
              ? e.message
              : t("loadError"),
      });
    } finally {
      setBusy(null);
    }
  }

  async function doEquip(skin: SkinManifest) {
    setBusy(skin.id);
    try {
      await equipSkin({ [skin.type]: skin.id });
      toaster.success({ title: t("equippedToast", { name: skinName(skin) }) });
    } catch (e) {
      toaster.error({ title: e instanceof ApiError && e.message ? e.message : t("loadError") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Container maxW="5xl" px={4} py={{ base: 4, md: 6 }} flex="1">
      <Stack gap={{ base: 4, md: 5 }}>
        <Stack gap={1} align="center">
          <Heading size="3xl" color="cream" textShadow="stickerText" textAlign="center">
            {t("title")}
          </Heading>
          <Text textAlign="center" color="cream" opacity={0.9}>
            {t("intro")}
          </Text>
          <HStack mt={1} bg="paper" border="sticker" borderRadius="full" px={3} py={1}>
            <WalletChips wallet={skins?.wallet ?? user?.wallet} />
          </HStack>
        </Stack>

        {user?.isGuest ? (
          <HStack
            layerStyle="sticker"
            bg="sun"
            p={3}
            justify="space-between"
            flexWrap="wrap"
            gap={2}
          >
            <Text>{t("guest")}</Text>
            <Button variant="sticker" size="sm" bg="mint" onClick={() => openProfile("account")}>
              {t("signIn")}
            </Button>
          </HStack>
        ) : null}

        <Tabs.Root value={tab} onValueChange={(e) => setTab(e.value as SkinType)} variant="plain">
          <Tabs.List gap={2} justifyContent="center" flexWrap="wrap">
            {(["pen", "box"] as const).map((key) => (
              <Tabs.Trigger
                key={key}
                value={key}
                bg={tab === key ? "mint" : "paper"}
                color="ink"
                border="sticker"
                borderRadius="full"
                boxShadow={tab === key ? "stickerSm" : "sticker"}
                px={5}
                fontWeight="600"
                fontFamily="hand"
                fontSize="lg"
              >
                {key === "pen" ? t("pens") : t("boxes")}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
        <Text textAlign="center" color="cream" opacity={0.8} fontSize="sm" mt={-2}>
          {tab === "pen" ? t("penHint") : t("boxHint")}
        </Text>

        <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={{ base: 3, md: 4 }}>
          {sorted.map((skin) => (
            <SkinCard
              key={skin.id}
              skin={skin}
              owned={!!skin.default || owned.has(skin.id)}
              equipped={loadout?.[skin.type] === skin.id}
              canBuy={canBuy}
              busy={busy === skin.id}
              onTry={() => setTrying(skin)}
              onBuy={() => setConfirm(skin)}
              onEquip={() => doEquip(skin)}
            />
          ))}
        </SimpleGrid>
      </Stack>

      <TryDialog skin={trying} onClose={() => setTrying(null)} />

      <Dialog.Root
        role="alertdialog"
        placement="center"
        open={!!confirm}
        onOpenChange={(e) => !e.open && setConfirm(null)}
      >
        <Portal>
          <Dialog.Backdrop bg="rgba(26, 40, 38, 0.6)" />
          <Dialog.Positioner px={4}>
            <Dialog.Content layerStyle="sticker" p={0} overflow="hidden" maxW="sm">
              <Dialog.Header bg="coral" borderBottom="sticker">
                <Dialog.Title fontSize="2xl" fontWeight="700" color="ink">
                  {confirm ? t("confirmTitle", { name: skinName(confirm) }) : ""}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body color="ink" py={5}>
                <HStack gap={2} flexWrap="wrap">
                  <Text>
                    {confirm
                      ? t("confirmBody", { price: rewardLabel(RARITY_PRICE[confirm.rarity]) })
                      : ""}
                  </Text>
                  {confirm ? <RewardChips reward={RARITY_PRICE[confirm.rarity]} /> : null}
                </HStack>
              </Dialog.Body>
              <Dialog.Footer pb={5} gap={3}>
                <Button variant="sticker" onClick={() => setConfirm(null)}>
                  {t("cancel")}
                </Button>
                <Button
                  variant="sticker"
                  bg="coral"
                  loading={!!confirm && busy === confirm.id}
                  onClick={() => confirm && doBuy(confirm)}
                  data-sfx="confirm"
                  data-testid="confirm-buy"
                >
                  {t("buy")}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" color="ink" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Container>
  );
}
