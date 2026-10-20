import { Box, Container, Heading, Stack, Text } from "@chakra-ui/react";
import { notFound } from "next/navigation";

// Trang dev: kiểm tra font UI và font viết tay hiển thị đủ dấu tiếng Việt (docs/12 — Font).
// Chỉ có ở môi trường development; production trả 404.
const SAMPLES = [
  "Thủ khoa — Vở ô li — Ruột chì",
  "ặ ỗ ữ ỷ ẫ ắ ờ ứ ễ ỵ đ Đ",
  "Ô Kìa! Một… hai… ba ô! Cảm ơn bạn nha",
  "Học sinh giỏi III · Giấy nháp I · COMBO ×3",
  "0123456789 — 1.250 Ruột chì",
];
const SIZES = ["sm", "lg", "3xl", "5xl"] as const;

export default function DevFontsPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <Container maxW="4xl" px={4} py={8}>
      <Stack gap={10}>
        {(["body", "hand"] as const).map((font) => (
          <Box key={font}>
            <Heading size="md" mb={4} color="fg.muted">
              fontFamily=&quot;{font}&quot;
            </Heading>
            <Stack gap={4}>
              {SIZES.map((size) => (
                <Stack key={size} gap={1}>
                  {SAMPLES.map((s) => (
                    <Text key={s} fontFamily={font} fontSize={size} lineHeight="1.3">
                      {s}
                    </Text>
                  ))}
                </Stack>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Container>
  );
}
