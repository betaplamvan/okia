import { Grid, GridItem } from "@chakra-ui/react";

// Bố cục chung cho mọi màn chơi (chơi với máy, phòng riêng, sau này xếp hạng):
// MÌNH luôn bên TRÁI bàn, ĐỐI THỦ luôn bên PHẢI.
//   - < lg (điện thoại, máy tính bảng dọc): hàng trên [mình | đối thủ], dòng trạng thái riêng bên dưới
//     (tên online dài không bóp nghẹt trạng thái), rồi bàn rộng hết chiều ngang, rồi các nút.
//   - lg+: cột trái = mình; giữa = trạng thái → bàn; cột phải = đối thủ, các nút ngay bên dưới
//     (không bị đẩy xuống dưới mép màn hình).
export function GameLayout({
  me,
  opponent,
  status,
  board,
  controls,
}: {
  me: React.ReactNode;
  opponent: React.ReactNode;
  status: React.ReactNode;
  /** Bàn (kèm đồng hồ / gợi ý nếu có). */
  board: React.ReactNode;
  controls: React.ReactNode;
}) {
  return (
    <Grid
      w="full"
      columnGap={{ base: 2, lg: 6 }}
      rowGap={3}
      alignItems="start"
      gridTemplateColumns={{
        base: "minmax(0, 1fr) minmax(0, 1fr)",
        lg: "13rem minmax(0, 1fr) 13rem",
      }}
      gridTemplateRows={{ lg: "auto 1fr" }}
      gridTemplateAreas={{
        base: `"me opp" "status status" "board board" "controls controls"`,
        lg: `"me status opp" "me board controls"`,
      }}
    >
      <GridItem area="me" justifySelf={{ base: "start", lg: "stretch" }} minW={0} maxW="full">
        {me}
      </GridItem>
      <GridItem area="status" alignSelf="center" minW={0}>
        {status}
      </GridItem>
      <GridItem area="opp" justifySelf={{ base: "end", lg: "stretch" }} minW={0} maxW="full">
        {opponent}
      </GridItem>
      <GridItem area="board" minW={0}>
        {board}
      </GridItem>
      <GridItem area="controls" minW={0}>
        {controls}
      </GridItem>
    </Grid>
  );
}
