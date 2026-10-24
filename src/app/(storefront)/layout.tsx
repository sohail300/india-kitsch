import AnnouncementBar from "./_components/announcement-bar";
import CartDrawer from "./_components/cart-drawer";
import Footer from "./_components/footer";
import Header from "./_components/header";
import LinkGuard from "./_components/link-guard";
import { shell } from "./_lib/content";
import { cormorant, inter } from "./fonts";
import "./storefront.css";

export default function StorefrontLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`storefront ${inter.variable} ${cormorant.variable}`}>
      <AnnouncementBar {...shell.announcement} />
      <Header header={shell.header} />
      <main id="main">{children}</main>
      <Footer footer={shell.footer} />
      <CartDrawer />
      <LinkGuard />
    </div>
  );
}
