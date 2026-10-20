import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Dùng các wrapper này thay cho next/link và next/navigation để URL luôn đúng locale.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
