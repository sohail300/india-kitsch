import HeroSlider from "./_components/home/hero-slider";
import {
  Editorial,
  MostLoved,
  NewEdit,
  SeoHeading,
  ShopByFabric,
  SignatureDesigns,
  TrustStrip,
} from "./_components/home/home-sections";
import Reels from "./_components/home/reels";
import { home } from "./_lib/content";

export default function HomePage() {
  return (
    <>
      <HeroSlider slides={home.slides} />
      <SeoHeading text={home.seoHeading} />
      <ShopByFabric fabric={home.fabric} />
      <MostLoved section={home.mostLoved} />
      <TrustStrip items={home.trust} />
      <NewEdit section={home.newEdit} />
      <Reels heading={home.reels.heading} items={home.reels.items} />
      <SignatureDesigns section={home.signature} />
      <Editorial section={home.editorial} />
    </>
  );
}
