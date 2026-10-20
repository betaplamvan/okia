import { Box, Container, Heading, Stack, Text } from "@chakra-ui/react";

type TextPageProps = {
  title: string;
  /** Dòng phụ nhỏ dưới tiêu đề (ví dụ ngày cập nhật). */
  note?: string;
  paragraphs: string[];
};

// Trang văn bản (giới thiệu, chính sách, điều khoản): một sticker card giấy kem.
export function TextPage({ title, note, paragraphs }: TextPageProps) {
  return (
    <Container maxW="3xl" px={4} py={{ base: 4, md: 8 }} flex="1">
      <Box layerStyle="sticker" px={{ base: 5, md: 8 }} py={{ base: 6, md: 8 }}>
        <Stack gap={4} color="ink" fontSize="lg">
          <Heading as="h1" size={{ base: "2xl", md: "3xl" }} fontWeight="700" color="ink">
            {title}
          </Heading>
          {note ? (
            <Text fontSize="md" opacity={0.7}>
              {note}
            </Text>
          ) : null}
          {paragraphs.map((p, i) => (
            <Text key={i}>{p}</Text>
          ))}
        </Stack>
      </Box>
    </Container>
  );
}
