import React from "react";
import { Composition, Still } from "remotion";
import { Thumbnail } from "./Thumbnail";
import { Launch } from "./Video";
import { FPS, S } from "./theme";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="MyPixelGuardLaunch" component={Launch} durationInFrames={S.end} fps={FPS} width={1920} height={1080} />
    <Still id="Thumbnail" component={Thumbnail} width={1280} height={720} />
  </>
);
