import { Box, Circle, Heading, HStack, Stack, Text, type BoxProps } from "@chakra-ui/react";
import { LuArrowRight } from "react-icons/lu";

type ModeCardProps = Omit<BoxProps, "title"> & {
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Màu nền thẻ: mint | coral | pink | sun | paper */
  tone: "mint" | "coral" | "pink" | "sun" | "paper";
  /** Nhãn nhỏ khi tính năng chưa sẵn sàng. */
  badge?: string;
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
export function ModeCard({ title, description, icon, tone, badge, ...rest }: ModeCardProps) {
  return (
    <Box
      layerStyle="sticker"
      bg={tone}
      position="relative"
      p={5}
      pb={7}
      minH="40"
      display="flex"
      flexDirection="column"
      justifyContent="space-between"
      transitionProperty="transform, box-shadow"
      transitionDuration="fast"
      _hover={{ transform: "translate(-1px, -1px)" }}
      _active={{ transform: "translate(3px, 3px)", boxShadow: "stickerSm" }}
      {...rest}
    >
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
      <Circle
        size="9"
        bg="paper"
        border="sticker"
        position="absolute"
        right={4}
        bottom={4}
        color="ink"
        aria-hidden
      >
        <LuArrowRight />
      </Circle>
    </Box>
  );
}
