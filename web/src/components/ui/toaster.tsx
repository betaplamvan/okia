"use client";

import {
  Toaster as ChakraToaster,
  createToaster,
  Portal,
  Spinner,
  Stack,
  Toast,
} from "@chakra-ui/react";

// Toast toàn app (snippet Chakra v3), tông sticker: giấy, viền đen, bóng cứng.
// Đặt ở dưới để không đè lên tiêu đề hộp thoại hồ sơ (full màn hình trên điện thoại).
export const toaster = createToaster({
  placement: "bottom",
  pauseOnPageIdle: true,
  duration: 4000,
});

export function Toaster() {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toast) => (
          <Toast.Root
            width={{ md: "sm" }}
            bg={toast.type === "error" ? "coral" : toast.type === "success" ? "mint" : "paper"}
            color="ink"
            border="sticker"
            borderRadius="sticker"
            boxShadow="sticker"
            fontFamily="hand"
          >
            {toast.type === "loading" ? <Spinner size="sm" /> : <Toast.Indicator color="ink" />}
            <Stack gap="1" flex="1" maxWidth="100%">
              {toast.title && <Toast.Title fontWeight="700">{toast.title}</Toast.Title>}
              {toast.description && <Toast.Description>{toast.description}</Toast.Description>}
            </Stack>
            {toast.action && <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>}
            {toast.closable && <Toast.CloseTrigger color="ink" />}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
}
