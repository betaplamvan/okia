import { Box, Circle, Heading, HStack, Stack, Text, type BoxProps } from "@chakra-ui/react";
import { LuArrowRight } from "react-icons/lu";
import { Link } from "@/i18n/navigation";

type ModeCardProps = Omit<BoxProps, "title"> & {
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Màu nền thẻ: mint | coral | pink | sun | paper */
  tone: "mint" | "coral" | "pink" | "sun" | "paper";
  /** Nhãn nhỏ khi tính năng chưa sẵn sàng. */
  badge?: string;
  /** Có href → cả thẻ là một link (next-intl Link, giữ đúng locale). */
  href?: string;
};

// Chấm trang trí góc thẻ dùng màu đối lập với nền (docs/14).
const DOT: Record<ModeCardProps["tone"], string> = {
  mint: "coral",
  coral: "mint",
  pink: "mint",
  sun: "coral",
  paper: "sun",
};

/** Thẻ chọn chế độ chơi theo phong cách sticker. */
export function ModeCard({ title, description, icon, tone, badge, href, ...rest }: ModeCardProps) {
  const inner = (
    <>
      <Circle
        size="3"
        bg={DOT[tone]}
        border="2px solid"
        borderColor="ink"
        position="absolute"
        top={3}
        right={3}
      />
      <HStack justify="space-between" align="flex-start">
        <Circle size="12" bg="paper" border="sticker" fontSize="2xl" color="ink">
          {icon}
        </Circle>
        {badge ? (
          <Text
            fontSize="sm"
            fontWeight="600"
            px={2}
            bg="paper"
            border="2px solid"
            borderColor="ink"
            borderRadius="full"
          >
            {badge}
          </Text>
        ) : null}
      </HStack>
      <Stack gap={0} mt={3}>
        <Heading as="h2" size="xl" fontWeight="700" color="ink" lineHeight="1.1">
          {title}
        </Heading>
        <Text fontSize="md" color="ink" opacity={0.85}>
          {description}
        </Text>
      </Stack>
      {/* Nút mũi tên: animation riêng khi hover thẻ (học noitu) — trượt sang phải, đổi nền vàng,
          mũi tên bên trong lắc nhẹ về phía trước. */}
      <Circle
        size="9"
        bg="paper"
        border="sticker"
        position="absolute"
        right={4}
        bottom={4}
        color="ink"
        aria-hidden
        transitionProperty="transform, background-color, box-shadow"
        transitionDuration="0.35s"
        transitionTimingFunction="cubic-bezier(0.22, 1, 0.36, 1)"
        _groupHover={
          href
            ? {
                transform: "translateX(6px) scale(1.08)",
                bg: "sun",
                boxShadow: "stickerSm",
                "& > svg": { animation: "okiaNudge 0.9s ease-in-out infinite" },
              }
            : undefined
        }
        _motionReduce={{ "& > svg": { animation: "none !important" } }}
      >
        <LuArrowRight />
      </Circle>
    </>
  );

  const styleProps: BoxProps = {
    layerStyle: "sticker",
    bg: tone,
    position: "relative",
    p: 5,
    pb: 7,
    minH: "40",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    className: "group",
    transitionProperty: "transform, box-shadow",
    transitionDuration: "0.35s",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    willChange: "transform",
    // Hover (học noitu): thẻ nhếch mép phải lên — xoay nhẹ ngược chiều kim đồng hồ, nhấc lên,
    // bóng dài ra; easing ease-out mềm (không nảy) để không giật. Bấm thì lún xuống. Giảm chuyển
    // động: chỉ nhấc nhẹ, không xoay.
    _hover: href
      ? { transform: "translate(-2px, -4px) rotate(-1.5deg)", boxShadow: "stickerLg" }
      : undefined,
    _active: href
      ? { transform: "translate(3px, 3px) rotate(0deg)", boxShadow: "stickerSm" }
      : undefined,
    _motionReduce: href ? { _hover: { transform: "translate(-1px, -1px)" } } : undefined,
    _focusVisible: { outline: "3px solid", outlineColor: "sun", outlineOffset: "2px" },
    opacity: href ? 1 : 0.92,
    ...rest,
  };

  if (href) {
    return (
      <Box asChild {...styleProps}>
        <Link href={href}>{inner}</Link>
      </Box>
    );
  }
  return <Box {...styleProps}>{inner}</Box>;
}
