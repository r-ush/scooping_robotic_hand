# Scooping Grasping with Robotic Hand (with Diffusion Policy Rollouts)

Research page for **diffusion policy rollouts and data collection** using fingertip force sensing on the AIDIN Robotics hand.

**Contributors:** Seunghwan Um, Tae Hyun Bae, Hyouk Ryeol Choi
**Affiliation:** Sungkyunkwan University

## Overview

The page presents Main Demo and Data Collection chapters, followed by three collapsed sections: Principle (original scooping and book demonstrations), Comparison (with and without compliance control), and Additional Technique.

The additional technique compensates for low hand mechanical stiffness by transforming fingertip wrenches into the wrist frame and adding them to wrist force feedback for the manipulator's compliance controller.

## Videos and language

Main Demo uses the final diffusion policy rollout. Data Collection uses the final combined collection video. The web copies use H.264/AAC with MP4 fast start; the HDR collection source is tone-mapped to SDR with nominal peak luminance 300, checked against the rollout and across the collection edit.

Videos play muted when visible, pause outside the viewport or in a closed section, and pause while the browser tab is hidden. Native playback controls remain available. EN/KR switches the page text without reloading media; English is the default, and an explicit language choice is remembered.

The media history was compacted to retain only the current web videos. Previous repository history is backed up separately before the rewrite.

## Website

[https://r-ush.github.io/scooping_robotic_hand/](https://r-ush.github.io/scooping_robotic_hand/)

## Template

Website template borrowed from [NeRFies](https://github.com/nerfies/nerfies.github.io).

Korean typography uses self-hosted Pretendard Variable 1.3.9. English retains the original Google Sans and Noto Sans styles. The font license is included in static/fonts/Pretendard-LICENSE.txt.

## IL / RL pages

The existing root page presents IL / Diffusion Policy. `rl/index.html` presents
reinforcement learning with an AIDIN hand, adapted from
`simtoolreal/project-page/`. Both pages share the research navigation.
The RL page includes a collapsed learning-pipeline overview, 24 recorded simulation
rollouts, and a distinct hand-model chapter with the original interactive studies.
Both approaches use the NeRFies publication theme with shared Bulma, English
fonts, Korean Pretendard, and research navigation. The RL page keeps its Three.js
viewers and controls; `rl/viewer-theme.css` styles the embedded rollout controls.

Recorded RL demonstrations autoplay when visible, including when the operating
system requests reduced decorative motion. Playback suspends outside the viewport
or in a hidden tab and resumes on return, preserving any explicit Pause or scrub.
`rl/rollout-playback.js` manages the embedded viewer lifecycle and releases its
WebGL context before a different recording replaces it.

[Open the RL page](https://r-ush.github.io/scooping_robotic_hand/rl/).

For a local preview, run `python ~/webpages/preview.py`, then open
<http://localhost:3000/scooping_robotic_hand/rl/>. The same server serves the main
homepage at `/` and the IL page at `/scooping_robotic_hand/`.

The RL page is a static subpage in this repository. `rl/assets/` contains the
referenced URDF and meshes; `rl/rollouts/` contains all 24 saved simulation
recordings and their gallery. Relative URLs work on GitHub Pages without the
simulation checkout or a localhost asset server. Three.js modules load from the
existing external CDN. `rl/data/public-assets.json` records the packaged files
and source hashes. Original simulation files remain unchanged.

To preview this repository alone, run `python3 -m http.server 3001` from the
repository root and open <http://localhost:3001/rl/>.
