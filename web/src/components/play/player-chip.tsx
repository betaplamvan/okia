import { Flex, HStack, Text } from "@chakra-ui/react";

// Chip người chơi trong HUD (dùng chung màn chơi với máy và phòng online).
export type PlayerChipProps = {
  icon: React.ReactNode;
  name: string;
  score: string;
  tone: string;
  active: boolean;
  reverse?: boolean;
};

export function PlayerChip({ icon, name, score, tone, active, reverse }: PlayerChipProps) {
  return (
    <HStack
      flexDirection={reverse ? "row-reverse" : "row"}
      gap={2}
      bg="paper"
      color="ink"
      border="sticker"
      borderRadius="full"
      boxShadow={active ? "sticker" : "stickerSm"}
      px={2}
      py={1}
      maxW="full"
      opacity={active ? 1 : 0.75}
      transform={active ? "translate(0,0)" : "translate(2px,2px)"}
      transition="all 0.15s"
    >
      <Flex
        align="center"
        justify="center"
        flexShrink={0}
        boxSize="8"
        borderRadius="full"
        bg={tone}
        color="paper"
        border="2px solid"
        borderColor="ink"
      >
        {icon}
      </Flex>
      <Text fontWeight="600" truncate minW={0} title={name}>
        {name}
      </Text>
      <Text fontWeight="700" fontSize="xl" px={2} minW="8" textAlign="center">
        {score}
      </Text>
    </HStack>
  );
}
