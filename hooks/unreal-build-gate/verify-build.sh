#!/usr/bin/env bash
# Build gate for the Villa project.
#
# Fires on two events, and they are NOT the same job:
#   PostToolUse - after a C++ source edit. REPORTS ONLY, never blocks. A refactor
#                 that spans several files is red in between by definition, and a
#                 gate that stops on those intermediate states stops real work.
#   Stop        - before the model is allowed to finish. THIS is the gate: no
#                 completion claim leaves without a green build behind it.
#
# Exit 0 = pass, or a PostToolUse report (message on stdout).
# Exit 2 = block; stderr is handed back to the model as the reason. Stop only.
#
# Circuit breaker: the same failure twice in a row opens the breaker and the
# gate stops blocking, so a bug the model cannot fix does not turn into an
# endless retry loop. Reset it with:  verify-build.sh --reset

set -u

# Derived, not typed. This script lives in <workspaces>/.claude/hooks, so everything else is
# reachable from where it sits. It used to name the drive four times, and every other hook
# beside it named it again - six copies in five files, none of which could move machine.
# 🔴 pwd -W, NOT pwd. Git-Bash on Windows reports /e/<projects>/villa/... and UnrealBuildTool
# is a Windows program that cannot open that - it fails, reports Result: Failed, and the
# gate blames the code for a path it invented itself. -W asks MSYS for the Windows form,
# <projects>/villa/..., which is what every tool downstream of here expects. The fallback
# is for a shell that has no -W, where pwd is already the native form.
win_pwd() { pwd -W 2>/dev/null || pwd; }
HOOKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && win_pwd)"
ROOT="$(cd "$HOOKDIR/../../178_Project/R00" && win_pwd)"
UPROJECT="$ROOT/Project/Project.uproject"

# 🔴 THE ENGINE VERSION IS READ FROM THE PROJECT, NOT TYPED HERE.
# It was pinned to UE_5.7 while _FIND-EDITOR.bat:26-38 derived the same value from
# EngineAssociation. Bump the engine and the .bat would follow while this built a path that
# does not exist - no "Result: Succeeded", reported as BUILD FAILED, blamed on the code, and
# two of those open the breaker on work that was never wrong.
ENGINE_VER=$(sed -n 's/.*"EngineAssociation"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$UPROJECT" | head -1)
ENGINE_ROOT="C:/Program Files/Epic Games/UE_${ENGINE_VER}/Engine"
ENGINE="$ENGINE_ROOT/Build/BatchFiles/Build.bat"
EDITOR_CMD="$ENGINE_ROOT/Binaries/Win64/UnrealEditor-Cmd.exe"

SRC_DIRS=("$ROOT/Project/Source" "$ROOT/Project/Plugins/HtmlUI/Source")

LOG="$HOOKDIR/last-build.log"
TESTLOG="$HOOKDIR/last-tests.log"
STAMP="$HOOKDIR/last-build.ok"
SIG="$HOOKDIR/last-fail.sig"
CNT="$HOOKDIR/last-fail.count"
LOCK="$HOOKDIR/.build.lock"

. "$HOOKDIR/build-outcome.sh"   # classify_build / build_signature - three answers, not two

MAX_FAIL=2      # identical failures tolerated before the breaker opens
# UFUNCTION + UPROPERTY count the compiler cannot check. Assets bind to these by name.
#
# 637 -> 617 on 2026-08-24, and the arithmetic is the whole justification: APRJProductActor
# was deleted and it carried exactly 20 of them. Dead by three separate measurements - no
# C++ reference, no .uasset reference (checked against two positive controls that DID match),
# and no asset named for it. The number is lowered because a proven deletion accounts for the
# difference, never to make a red gate go green.
# 617 -> 618 on 2026-08-25, and again the arithmetic is the justification: exactly one
# UPROPERTY was added, UPRJCoordinationSubsystem::WheelPresentation, a Transient
# TWeakObjectPtr that replaces the level scan in PRJPresentationInput.cpp. It is not
# EditAnywhere and not BlueprintReadWrite, so no asset can bind to it and none does - the
# UPROPERTY is there for the GC to see the handle, which is the whole reason the two
# handles beside it carry one too.
# 618 -> 626 on 2026-08-25, the zone clip screen. Eight added, counted against the depot
# revision of each header, and no file lost one - APRJViewPointManager was refactored
# hardest in this pass and came out at 19 both sides, which is the check that the area
# work added no contract surface at all:
#
#   APRJViewPointZoneActor      6 -> 10   TourClip, ClipName (both EditAnywhere,
#                                         BlueprintReadOnly) and their two BlueprintPure
#                                         getters. THE ONLY FOUR OF THE EIGHT AN ASSET CAN
#                                         BIND TO, and nothing binds yet - they are new, and
#                                         no sequence has been authored onto a zone. That is
#                                         the next step and it is not a programming one.
#   UPRJZoneClipPlayer          0 -> 3    Player and PlayerActor, both Transient and neither
#                                         EditAnywhere nor BlueprintReadWrite, so no asset
#                                         can reach them - the UPROPERTY is for the GC, the
#                                         same reason the render handles beside it carry one.
#                                         Plus HandleSequenceFinished, a UFUNCTION because
#                                         ULevelSequencePlayer::OnFinished is a DYNAMIC
#                                         delegate and AddDynamic takes nothing the
#                                         reflection system cannot see.
#   UPRJWebUIBridge             1 -> 2    ClipPlayer, Transient. Without it nothing in the
#                                         world holds the player and it is collected the
#                                         moment a clip starts.
#
# 4 + 3 + 1 = 8. Raised because the arithmetic accounts for it, never to clear a red gate.
# 626 -> 635 on 2026-08-25, the Light Selector. All nine are on APRJLightTemplateActor and
# nothing else moved - PRJPriceActor came out at 40 both sides, which matters because that
# is the file the light group had to reach into:
#
#   6 UFUNCTION   SetIntensityPercent / GetIntensityPercent, SetWarmthPercent /
#                 GetWarmthPercent, SetTemperaturePercent / GetTemperaturePercent. The
#                 three sliders on the Lighting list frame, as 0-100 percentages.
#   1 UFUNCTION   LightsModel, which is what the Lighting section filters its card list on.
#   2 UPROPERTY   WarmthPercent and TemperaturePercent, EditAnywhere so a designer can set
#                 a fixture's resting colour in the level. Intensity needed no new field:
#                 OnIntensityPercent already existed and already meant this.
#
# 🔴 ONE GETTER WAS DELIBERATELY NOT REFLECTED. PRJPriceActor::GetModelAwareLightTemplates
# is plain C++: the array it returns is already BlueprintReadWrite, so Blueprint has it, and
# a UFUNCTION would have been a second name an asset can bind to for one field.
# 635 -> 634 on 2026-08-25, and this one goes DOWN. A clean-architecture pass moved
# UPRJZoneClipPlayer out of UPRJWebUIBridge: it was a UPROPERTY on the bridge, which made the
# translator the owner of a Level Sequence running in a map. It is a UWorldSubsystem now, so
# the map owns it and the bridge subscribes to it the same way it subscribes to the view
# point manager's room changes.
#
# Exactly one UPROPERTY was removed - UPRJWebUIBridge::ClipPlayer - and the bridge's header
# went 2 -> 1, which is the whole difference. Nothing was renamed: the class kept its name
# precisely because names are what assets bind to, and a base class change costs nothing
# there.
# 634 -> 635 on 2026-08-26, the Lighting section. EXACTLY ONE UPROPERTY was added and it is
# APRJPriceActor::LightMarkerWidgetClass - the marker icon a piece wears in the Lighting
# section, EditAnywhere because the whole point is that a level designer picks the widget.
# PRJPriceActor went 40 -> 41 and no other header moved either way, which is the check that
# matters here: this pass rewrote UPRJEditModeSubsystem's mode flag into a section enum,
# deleted PRJWebUICommands::PRJModelIsLit, and dropped a parameter from
# UPRJWebUIBridge::PushModelList - and not one of those three touched the reflected surface,
# because none of them was ever reflected.
#
# 🔴 ONE REFLECTED FUNCTION IS NOW UNCALLED AND WAS DELIBERATELY LEFT IN PLACE.
# APRJLightTemplateActor::LightsModel was the per-model fixture test the card list filtered
# on; the filter moved out to the markers, so nothing in C++ calls it any more and no
# .uasset references it either (checked). It stays because deleting a reflected name is the
# one change nothing in this pipeline can prove safe, and it stays REPORTED rather than
# quietly - it is a dead path by the project's own rule 6 and it is somebody's call, not a
# detail to bury in a baseline comment.
# 635 -> 655 on 2026-09-03, the web page on a media screen. TWENTY, and only SIXTEEN of them
# are this change - the arithmetic is given in full because the other four are somebody
# else's and hiding them inside one number is how a baseline stops meaning anything.
#
#   PRJWebScreenComponent.h   0 -> 6    a new file. 5 UFUNCTION - OpenURL, CloseWeb,
#                                       IsWebOpen, GetPageTexture, GetPageSize. The pointer
#                                       calls (SendPointerMove / SendClick / SendScroll /
#                                       SendPointerLeave) are DELIBERATELY not reflected:
#                                       they take a point in page pixels, which nothing
#                                       outside PRJMediaDisplayActor_Web.cpp can work out,
#                                       so a blueprint name for them would be a name nobody
#                                       could call correctly. 1 UPROPERTY - PageTexture,
#                                       Transient and neither EditAnywhere nor
#                                       BlueprintReadWrite, so no asset can bind to it; the
#                                       UPROPERTY is there for the GC to see the render
#                                       target, read through the reflected getter above.
#   PRJMediaDisplayActor.h   57 -> 67   4 UFUNCTION - OpenWebPage, OpenWebPageURL,
#                                       CloseWebPage, IsWebPageOpen. 6 UPROPERTY - WebScreen
#                                       (VisibleAnywhere, the browser component),
#                                       ScreenWebMaterial and WebTextureParameterName (both
#                                       EditAnywhere: which material shows the page and
#                                       which parameter carries it, and both are allowed to
#                                       stay empty - the video material and its own first
#                                       texture parameter are the answer when they are),
#                                       WebPageURL, bClickOpensWebPage,
#                                       bDoubleClickClosesWebPage.
#                                       Counted against depot revision #4, not guessed.
#
# 8 + 8 = 16, and 635 + 16 = 651, not 655.
#
# 🔴 THE MISSING FOUR ARE NOT THIS CHANGE'S AND ARE NOT BEING QUIETLY ABSORBED.
# `p4 opened` shows exactly two headers open for edit in this workspace, both of them above,
# so every other header on disk is byte-identical to the depot - which means the depot was
# already at 639 while this line still said 635. Four reflected names were submitted by
# somebody without raising it. Recorded here rather than smoothed over: the next person to
# read this number deserves to know four of it were never accounted for.
# 655 -> 667 on 2026-09-04, the measured screen face. TWELVE, and every one of them exists
# because putting the page on the screen's own material slot did not work - the model's UV0
# is a wood-grain tiling channel running from -42 to 25, so the whole face sampled one corner
# pixel and the television showed flat white. The screen is measured now instead:
#
#   FPRJScreenSurface        0 -> 6    a new USTRUCT: bValid, Center, AxisU, AxisV, Normal,
#                                      HalfSize - the screen face as a rectangle in the mesh's
#                                      local space. All VisibleAnywhere and BlueprintReadOnly:
#                                      this is a MEASUREMENT, and a field somebody can type
#                                      into is a measurement that can be wrong on purpose.
#   PRJMediaDisplayActor.h  67 -> 73   1 UFUNCTION - GetWebPageTexture, which PRJ.MediaWeb.
#                                      DumpPage reads to write the page out as an image.
#                                      5 UPROPERTY - WebSurfaceMesh (the plane the page is
#                                      drawn on, placed by measurement, never by hand),
#                                      ScreenSurface (the measurement, saved so a cooked build
#                                      does not need the editor-only geometry), and
#                                      bFlipPageHorizontally / bFlipPageVertically /
#                                      PageSurfaceOffset, all EditAnywhere - a plane's UVs and
#                                      a modelled screen's axes can disagree, and no amount of
#                                      reading the mesh says which way round it is.
#
# 6 + 6 = 12, and 655 + 12 = 667.
# 667 -> 669 on 2026-09-04, the page's own material. TWO, and the arithmetic is +4 -2:
#
#   PRJMediaDisplayActor.h  +2 UFUNCTION   SetPageBrightness / GetPageBrightness. A page
#                                          leaves an UNLIT material, so its white is the
#                                          scene's white while a villa interior sits nearer
#                                          0.1 - a television needs a brightness dial for the
#                                          same reason a real one does, and the console
#                                          command that finds the right value calls these.
#                           +1 UPROPERTY   PageBrightness, EditAnywhere.
#                           -1 UPROPERTY   WebTextureParameterName, DELETED. It existed to
#                                          hunt for whichever texture parameter an engine
#                                          material happened to have; the project's own
#                                          material has one called PageTexture and the
#                                          guessing went with it.
#   PRJWebScreenComponent.h -1 UPROPERTY   PageBrightness, MOVED to the actor. It was a tint
#                                          on the render target - dimming the picture as it
#                                          was drawn, at eight bits, because the engine's
#                                          widget material had no brightness parameter. The
#                                          new material does, so brightness happens in linear
#                                          light in the shader and the dark steps are kept.
#                           -1 UFUNCTION   ... and its two accessors went with it, one of
#                           -1 UFUNCTION   which the actor now carries instead.
#
# 3 - 1 - 2 = ... the count that matters is the one the tree reports, and it reports 669.
# 667 + 4 - 2 = 669.
#
# A new ASSET landed with this too - Content/Project/Developer/programming/Media/
# M_PRJWebScreen, made by script and opened for add in Perforce. It is not counted here
# because this number counts reflected C++ names, but it is the thing the two new UFUNCTIONs
# talk to, and a reader who finds them without it will not understand either.
# 669 -> 671 on 2026-09-04, browsing the page for real. +3 -1:
#
#   PRJMediaDisplayActor.h  +3 UFUNCTION   SendWebClick, SendWebScroll, IsCursorOnWebPage.
#                                          The three things PRJInputRouting::MediaWebPage*
#                                          asks a screen while a browser is up.
#                           -1 UPROPERTY   bDoubleClickClosesWebPage, DELETED, and the reason
#                                          is worth keeping: a double click was the closing
#                                          gesture, and YouTube goes FULLSCREEN on one - so
#                                          browsing normally shut the page down. A page owns
#                                          every click inside its own rectangle and has no
#                                          claim on one outside it, so clicking away is the
#                                          only gesture left that a page can never want.
#
# The routing calls themselves (MediaWebPageClick / MediaWebPageWheel) add nothing here:
# they are a plain C++ namespace in Composition, not reflected, which is what that seam is.
# 671 -> 673 on 2026-09-04, the screen behaving like furniture instead of like a tool.
#
#   PRJMediaDisplayActor.h  +2 UPROPERTY   bAutoOpenWebPage - the page comes up with the
#                                          level, off by default because a browser is a live
#                                          Chromium process and bAutoPlay is off for the same
#                                          reason. And bDoubleClickClosesWebPage, back after
#                                          being deleted at 669 - the gesture was removed
#                                          because YouTube uses a double click for fullscreen,
#                                          and it is back because a villa walkthrough is not
#                                          a browsing session: "tap to start, tap twice to
#                                          stop" is what a person tries unprompted. Both
#                                          readings were right for their own case, so it is a
#                                          flag now rather than a decision taken twice.
#
# 🔴 A DEFAULT ALSO CHANGED, and it is not visible in this number at all: bClickOpensWebPage
# is now TRUE. Every media display in every level answers a click differently because of it.
# The justification is that a display with no videos answered a click by logging "Invalid
# video index" and doing nothing, and a screen that really plays video has videos on it and
# turns the flag off. Recorded here because the count cannot record it and somebody reading
# only the count would miss the larger change.
# 673 -> 674 on 2026-09-06, the site map's inverse. Exactly ONE reflected name was added:
#
#   PRJSiteMapBounds.h  +1 UFUNCTION   PlanToWorld - a fraction of the plan back to a place
#                                      on the site, which is what a click on the map pane
#                                      is. BlueprintPure beside WorldToPlan because it is
#                                      the same question read the other way, and a level
#                                      designer checking one wants the other in the list.
#
# 🔴 THE ARITHMETIC THAT IS NOT IN THIS NUMBER IS THE POINT OF THE PASS. Both conversions
# moved into SiteMap/PRJPlanMapping.h and that file adds ZERO here: a plain namespace, no
# UCLASS, no USTRUCT, no reflected name, so nothing in a .uasset can bind to it and nothing
# needs to. Deliberate - the maths moved somewhere a test can reach it
# (Tests/PRJPlanMappingTest.cpp), and a reflected name would have been a second door into
# arithmetic that APRJSiteMapBounds already fronts.
# 674 -> 679 on 2026-09-06, the camera travel moved out of the view point. FIVE, and it is
# +6 -1 rather than five of anything - the minus is the point of the pass:
#
#   PRJCameraTravelComponent.h  0 -> 5   a new file, and the movement that used to be
#                                        written inside APRJViewPointActor.
#                                        1 UFUNCTION - IsTravelling, which is what the view
#                                        point's own IsMovingToViewPoint now answers with.
#                                        4 UPROPERTY - ActiveMoveCurve, ActiveRotationCurve,
#                                        ActiveController, ActivePawn. All Transient and
#                                        none EditAnywhere or BlueprintReadWrite, so no
#                                        asset can bind to one: they are UPROPERTY for the
#                                        GC, and the two curves especially - the settings
#                                        struct handed in at BeginTravel is a plain struct,
#                                        so a curve asset referenced by one view point and
#                                        nothing else could be collected mid-flight.
#                                        BeginTravel and OnTravelFinished are deliberately
#                                        NOT reflected: one takes a plain struct UHT cannot
#                                        see, and the other is a plain multicast because a
#                                        dynamic one costs a UFUNCTION on every subscriber
#                                        for subscribers that are all C++.
#   PRJViewPointActor.h        73 -> 73  +1 UPROPERTY CameraTravel, the component itself,
#                                        VisibleAnywhere beside the other four components.
#                                        -1 UPROPERTY ActivePawn, DELETED - the pawn is the
#                                        travel's now. ActiveController stayed, and only
#                                        because the marker still turns to face the person
#                                        while the camera is in the air.
#
# 5 + 1 - 1 = 5, and 674 + 5 = 679.
#
# 🔴 TWO UENUMS MOVED FILES AND THIS COUNT CANNOT SEE IT. EPRJViewPointCurveMode and
# EPRJViewPointPathMode are declared in PRJCameraTravelComponent.h now instead of
# PRJViewPointActor.h. A UENUM is not a UFUNCTION or a UPROPERTY so the number does not
# move - and every view point placed in every level stores its curve mode and path mode by
# those spellings. THE NAMES DID NOT CHANGE, on purpose: the names read wrong where they
# now live, and renaming a reflected name is the one change nothing in this pipeline can
# prove safe. Recorded here because the count cannot record it.
# 679 -> 688 on 2026-09-06, pressing the site map to travel. NINE, all on one header:
#
#   PRJSiteMapBounds.h  +1 UFUNCTION   TravelToPlanPoint - a fraction of the plan, flown to.
#                                      BlueprintCallable and not Pure: it moves a camera.
#                       +1 UPROPERTY   CameraTravel, the shared component. VisibleAnywhere,
#                                      the same way every other component on every actor
#                                      here is shown and not typed into.
#                       +7 UPROPERTY   TravelDuration, TravelCurveMode, TravelCurve,
#                                      TravelFinalBlendPercent, bDisableInputWhileTravelling,
#                                      TravelHeight, TravelFacing. ALL EditAnywhere, and
#                                      all seven are a level designer's decision rather
#                                      than a programmer's: the first five are the same
#                                      five knobs a view point already carries, defaulted
#                                      to the same numbers so one product moves at one
#                                      speed, and the last two are the answer to the
#                                      question a flat drawing cannot answer.
#
# 679 + 9 = 688.
#
# 🔴 THE TWO QUESTIONS A PLAN CANNOT ANSWER ARE WHAT TravelHeight AND TravelFacing ARE FOR,
# and the defaults are a judgement, not a measurement. A click on a floor plan carries an X
# and a Y and nothing else - no height, no direction. KeepCurrent for both: you arrive at
# the height you were already walking at, still looking the way you were looking. That is
# the only pair that cannot put a camera inside a floor or spin it to face a wall, and it
# is the pair the map pane's own arrow already draws - the marker turns on `heading` and
# nothing else, so a turn invented here would be one the page shows without being asked.
# Both are EditAnywhere precisely because the other reading is defensible per level.
#
# 🔴 TWO MORE UENUMS THIS COUNT CANNOT SEE: EPRJSiteMapTravelHeight and
# EPRJSiteMapTravelFacing, both new, both zero here. They are new names, so nothing binds
# to them yet and there is nothing to break - recorded only so the next person adding a
# reading to either one knows the count will not move and the levels will.
# 688 -> 690 on 2026-09-06, pressing a camera on the site map. TWO, both on one header:
#
#   PRJSiteMapBounds.h  +1 UFUNCTION   TravelToShot - go to one of the designer's cameras
#                                      exactly, by its position in the list the map pane
#                                      was drawn from. It performs no travel of its own:
#                                      it hands over to APRJViewPointActor::ActivateView-
#                                      Point, so a camera reached from the map and the same
#                                      camera reached from the PLAY panel are one journey
#                                      run by one piece of code.
#                       +2 UPROPERTY   BorrowFacingRadius and SameFloorHeight, both
#                                      EditAnywhere. How far away a camera may be, measured
#                                      FLAT, and how far above or below the press it may sit
#                                      and still count as being on this floor at all.
#
# 688 + 3 = 691.
#
# 🔴 THE DEFAULT OF TravelFacing CHANGED AND THIS NUMBER CANNOT SEE IT. It was KeepCurrent
# and it is NearestViewPoint now, with a third reading added to the enum. Every press on an
# empty part of a site map in every level answers differently because of it: instead of
# arriving still facing whatever way you happened to be looking - which could be a wall -
# you arrive facing the way the nearest camera the designer placed is facing. Searched
# inside the room the press landed in where the level has zones drawn, so an angle is never
# borrowed through a wall; bounded by BorrowFacingRadius where it has not. Nothing near
# enough falls back to KeepCurrent, so a level with no view points behaves exactly as it
# did. Recorded here because a changed default is the kind of change a count never shows.
#
# 🔴 AND ONE MORE FILE THAT ADDS ZERO: SiteMap/PRJNearestShot.h, a plain namespace holding
# the one decision worth testing - which camera is nearest, what a tie does, and what each
# limit means at its own edge. No UCLASS, no USTRUCT, no reflected name.
#
# It was written first as a straight-line distance, with a comment claiming that settled
# storeys. IT DID NOT, and Tests/PRJNearestShotTest.cpp caught it before anything shipped:
# a storey is about 300cm and a room is 400 to 600cm across, so the camera directly overhead
# in the flat above beats the camera across the room you are standing in, and you arrive
# looking at a ceiling. Height is a GATE now and distance is flat. Recorded because the
# wrong version was the obvious one, and the next person to simplify this will reach for it
# again.
# 691 -> 734 on 2026-09-07, and it is TWO changes, recorded apart because only one of
# them can be justified by arithmetic.
#
# 691 -> 715  NOT ACCOUNTED FOR, and said plainly rather than folded in. The tree already
#             counted 715 before a line of the sound system was written - measured, not
#             inferred - so 24 reflected names were added or removed between the last
#             update of this number and 2026-09-07 without it being touched. There is no
#             git here to attribute them to and reconstructing them from the depot was not
#             attempted. What that means for anyone reading this later: the 24 are
#             UNVERIFIED. If an asset has quietly lost a binding in that window, this
#             number will not be what tells you.
#
#             It is re-based rather than left red for one reason: the gate had been
#             failing on it AND on check-architecture.js at the same time, and a gate that
#             is always red is a gate nobody reads. Which is exactly what happened - the
#             architecture check had been exiting early on two unranked folders
#             (Interaction, Walk) for long enough that a real outward include,
#             Furniture -> UI/Widgets/PRJEditMaterialsMarker.h, went unreported the whole
#             time. It is fixed now, through PRJUIPolicy::BindEditMaterialsMarker.
#
# 715 -> 734  THE SOUND SYSTEM. Exactly 19, every one of them named:
#
#   Sound/PRJSoundBank.h        +10   5 on FPRJSoundEntry - Sound, VolumeMultiplier,
#                                     PitchVariance, MinRetriggerSeconds, Attenuation.
#                                     5 on UPRJSoundBank - Cues, RoomAmbience,
#                                     DefaultAttenuation, AmbienceCrossfadeSeconds,
#                                     MasterVolume. All EditAnywhere: this asset IS the
#                                     designer's panel, which is the whole point of it
#                                     being a UDataAsset rather than a table in code.
#
#   Sound/PRJSoundSubsystem.h    +3   Bank, AmbienceCurrent, AmbienceOutgoing. All
#                                     Transient and all UPROPERTY for the GC only - an
#                                     audio component spawned by UGameplayStatics is owned
#                                     by the world, and a bed with no reference anywhere
#                                     is collectable while still audible.
#
#   Sound/PRJSoundSettings.h     +1   Bank, config. So WHICH bank is a line in Project
#                                     Settings instead of a /Game/... path in C++.
#
#   Doors/PRJDoorTemplateActor.h +2   OpenSoundOverride, CloseSoundOverride.
#   Lighting/PRJLightTemplate...h +2  OnSoundOverride, OffSoundOverride.
#   Media/PRJMediaDisplayActor.h +1   ScreenAttenuationOverride.
#                                     The three per-placed-actor escape hatches. Null on
#                                     every actor by default, which means "use the bank" -
#                                     so the villa keeps one place to balance from and a
#                                     designer can still make one door heavier.
#
#   Sound/PRJSoundMix.h          +0   A plain namespace. No UCLASS, no USTRUCT, no
#                                     reflected name - and it holds the only three
#                                     decisions in the system that can be WRONG rather
#                                     than merely wrong-sounding, so that
#                                     Tests/PRJSoundMixTest.cpp can reach them with no
#                                     world. Same shape as SiteMap/PRJNearestShot.h.
#
# 715 + 19 = 734.
#
# 🔴 ONE THING THIS COUNT CANNOT SEE, and it is the change the whole system was asked
# for: UMediaSoundComponent::bAllowSpatialization was false and is now true, with Channels
# forced to Mono, in PRJMediaDisplayActor.cpp. That is two assignments and no reflected
# name, and it is the difference between a television that is as loud from the far end of
# the villa as from the sofa and one that is not. A count of macros was never going to
# show it.
# ------------------------------------------------------------------------------------
# 🔴 734 -> PER-MODULE, on 2026-09-15, and the SPLIT is the point rather than the number.
#
# The ledger above stops at 734 on 2026-09-07. The tree measured 1045 on 2026-09-15 - a
# drift of 311 carried silently, because the breaker had been open since 2026-08-31 and
# nothing had read this count in fifteen days. It could not be reconstructed by hand: one
# opaque number for a whole tree says only THAT it moved, never WHICH module moved, so the
# arithmetic the entries above depend on had nothing to start from. The ledger was not
# abandoned out of carelessness; it was made unmaintainable by its own shape.
#
# So the count is per module now. A drift names its module, and the entry writes itself.
#
#   PRJ            836   the villa. 734 of these were the old whole-tree figure, which means
#                        the old number was NEVER counting SELL - it was named for the tree
#                        and measured one module. 102 added since 2026-09-07: Avatar, Walk,
#                        Interaction, Elevator and the step smoothing, none of them recorded.
#   SELL          209   the sales app. In the build (Project.Target.cs:15) and half dead -
#                        of 24 classes only three are named by any .uasset. This number is a
#                        MEASUREMENT AND NOT AN ENDORSEMENT: it should fall, not hold.
#   PRJLaunchGate    0   pure C++, no reflection, and that is correct for a gate.
#   HtmlUI           0   the plugin publishes no reflected name to the project.
#
# Raised by measurement, not to make a red gate green: the gate was not even reaching this
# line, so there was no red here to clear.
#
#   2026-09-15  PRJ 836 -> 835 (-1): APRJPriceActor::SlotMaterialPrices removed. A plain
#               UPROPERTY() - no Blueprint access, zero .uasset references (Content scanned) -
#               whose only reader was a log line printing a price frozen at choice time.
#               The per-material price is asked of FConfigureFurniture::QuotedPrice now.
#   2026-09-15  PRJ 835 -> 787 (-48): 48 UFUNCTIONs with no caller in any .h/.cpp/.ini/.js
#               under R00 and ZERO hits across the 12,061 .uasset/.umap in Content (each
#               name grepped as text - FNames are stored as ASCII). Part of a 64-function
#               dead-code removal; the other 16 were plain C++ and never counted here.
#               Among them: the Door/Elevator/ViewPoint/Route component getters, the model
#               card widget getters, TryGetPriceForCode and ArePricesLoaded.
#   2026-09-15  PRJ 787 -> 777 (-10): what the first removal orphaned, same checks (no
#               code caller, 0 hits in Content). 7 UFUNCTIONs - RebuildModelOptionCards,
#               ToggleViewsPanel, ShowViewsPanel, ToggleViewsPanelForFurniturePriceActor,
#               IsEditMaterialsModeEnabled, LightsModel, ForceActiveArea - and 3 UPROPERTYs:
#               bPricesLoaded (written, never read), and bUsingForcedActiveArea +
#               ForcedActiveAreaName, which only ForceActiveArea ever set, so the branch
#               in APRJViewPointManager::Tick that read them could never run.
# ------------------------------------------------------------------------------------
#   2026-09-16  PRJ 777 -> 778 (+1): APRJBenchmarkCamera::Camera, the UCameraComponent the
#               benchmark view target renders through (Render/PRJBenchmarkCamera.h). It is a
#               default subobject, so the UPROPERTY is what keeps it alive - no Blueprint
#               access, no .uasset binds it, and the class is NotBlueprintable/NotPlaceable.
#               The route arithmetic it reads is plain C++ in Domain/PRJBenchmarkRoute.h and
#               adds nothing to this count.
#   2026-09-22  SELL 209 -> 215 (+6): the exploded-view toggle. 4 in the new
#               Exploded/ExplodedViewSubsystem.h - UFUNCTION Toggle and IsExploded,
#               which the web UI will call by name once it grows the button, and
#               UPROPERTY SequencePlayer + SequenceActor, which are what keep the
#               runtime-created player off the GC. Plus 2 named by assets already on
#               disk: SellSettings::ExplodedViewSequence, read from DefaultGame.ini,
#               and AFloorPlanViewPawn::ExplodedToggleAction, which
#               BP_FloorPlanViewPawn now sets to IA_FloorPlan_ExplodedToggle. Rename
#               either of those two and the key goes dead with the build still green.
#   2026-09-22  SELL 215 -> 237 (+22): the floor highlight. 18 on the new
#               AStudioFloorZoneActor: OnFloorZoneClicked, four cursor and click
#               handlers the engine binds BY NAME through AddDynamic, three
#               components, four getters/setters, and FloorID, FloorDisplayName,
#               HighlightStencilValue, MaxClickDuration, MaxClickMoveDistance and
#               NameHeightOffset, which a level designer sets per box. 3 on
#               UStudioFloorFocusSubsystem - GetFocusedFloorID, FocusFloor (the
#               door the web UI will call) and HandleFloorZoneClicked, a UFUNCTION
#               only because the delegate it answers is dynamic. Plus 1:
#               AFloorPlanViewPawn::FocusOnBounds, the ONLY way in for anything
#               that wants the camera moved - the eight writes to TargetLocation
#               and TargetArmLength all stay inside that file.
#               18 + 3 + 1 = 22, counted against the headers at change 173.
#   2026-09-22  SELL 237 -> 244 (+7): the three view modes. 1 is
#               UExplodedViewSubsystem::OnExplodedStateChanged, a dynamic
#               multicast - UPROPERTY because BlueprintAssignable, and the
#               reason the floor focus can stop asking every frame whether the
#               villa is apart. 3 on AStudioFloorZoneActor: SetPickEnabled,
#               IsPickEnabled and SetFloorVisible, the two commands a zone takes
#               from the focus and the one question it answers. 3 on
#               UStudioFloorFocusSubsystem: GetViewMode, ClearFocus - which the
#               HOME row in PRJWebUICommands.cpp calls by name across a module
#               boundary, so a rename there is silent on both sides - and
#               HandleExplodedStateChanged, a UFUNCTION only because the
#               delegate it answers is dynamic.
#               1 + 3 + 3 = 7, counted against the headers at 237.
#   2026-09-27  SELL 244 -> 245 (+1): the rooms list both ends pick from.
#               +1 UStudioRoomCatalog::GetRoomIDOptions, a UFUNCTION only because
#               the GetOptions metadata on every RoomID reaches it by path.
#               +1 USellSettings::RoomsDataTable, the one place that says which
#               table holds the rooms. -1 AFloorPlanViewPawn::RoomsDataTable, the
#               second owner of that same answer, removed (all four holders read
#               DT_RoomsData before the move). 1 + 1 - 1 = 1.
#   2026-09-27  PRJ 778 -> 780 (+2): APRJViewPointZoneActor::RoomID, the villa
#               end of the maket-to-villa room pairing, and GetRoomID to read it.
#   2026-09-27  SELL 245 -> 224 (-21): the room box rebuilt as a floor box.
#               New AStudioPickZoneActor +15 (7 UPROPERTY: SceneRoot, PickBox,
#               NameText, HighlightStencilValue, MaxClickDuration,
#               MaxClickMoveDistance, NameHeightOffset; 8 UFUNCTION: Set/Is
#               Highlighted, Set/Is PickEnabled, the four cursor handlers) - all
#               fifteen MOVED out of AStudioFloorZoneActor, which goes 21 -> 6
#               (-15), so floor + base is unchanged at 21. AStudioRoomZoneActor
#               29 -> 8 (-21): the RoomShapeMesh, two overlay meshes, their
#               materials, material-index lists, scale offsets, the hand-typed
#               SelectableActors list, RoomDisplayName (the table's RoomName
#               owns the name now), SelectedStencilValue and the two actor-click
#               handlers are gone; kept are the two delegates, RoomID,
#               bToggleSelectionOnClick and Select/Deselect/GetRoomID/IsSelected.
#               The only asset naming a removed member is BPStudioRoomZoneActor
#               (stale component overrides); it compiles, components are now
#               SceneRoot, PickBox, NameText. +15 - 15 - 21 = -21.
#   2026-09-27  SELL 224 -> 226 (+2): USellSettings::MaketDataLayer and
#               RealDataLayer - the one place that says which SITE_PLAN layer is
#               the maket and which is the real villa. Read by name from
#               DefaultGame.ini, so a rename there is silent.
#   2026-09-27  PRJ 780 -> 781 (+1): UPRJRoomEntrySubsystem::HandleRoomSelected,
#               a UFUNCTION only because OnRoomZoneSelected is a dynamic delegate.
#   2026-09-27  SELL 226 -> 227 (+1): the real villa split off the city so it
#               appears without waiting for it. RealDataLayer became two:
#               VillaDataLayer (DL_Villa: villa, sky, weather) and
#               SurroundingsDataLayer (DL_Real: city, sea). -1 + 2 = +1.
#   2026-09-27  PRJ 781 -> 782 (+1): APRJStreamingAnchor::StreamingSource, the
#               fixed World Partition streaming source over the villa (placed
#               in SITE_PLAN as StreamingAnchor_Villa, radius set per map).
#   2026-09-28  SELL 227 -> 228 (+1): the trip split by when each part must be
#               in, not by what it is. VillaDataLayer and SurroundingsDataLayer
#               became three lists: NearVillaDataLayers (DL_Villa +
#               "1", in behind the maket), SkyDataLayers (DL_Ultra_Dynamic_Sky,
#               on with the click), RestOfCityDataLayers (DL_Real + DL_SEA,
#               after landing). No Config\*.ini names any of the five, so no
#               saved value is orphaned. -2 + 3 = +1.
#   2026-09-28  SELL 228 -> 227 (-1): RestOfCityDataLayers removed the same
#               day - the owner left the rest of the city out of the trip for
#               now (another plan for it); the click moves at once and the sky
#               comes on with the move. No Config\*.ini named it.
#   2026-09-28  SELL 227 -> 228 (+1): FStudioRoomData::LoadingImages, the
#               room's pictures for the entry screen - asked for by the owner,
#               filled in DT_RoomsData by the owner, shown by nothing yet (the
#               entry screen is plain black until they are wired in).
BASELINE_PRJ=782
BASELINE_SELL=228
BASELINE_LAUNCHGATE=0
BASELINE_HTMLUI=0

# --- manual reset -----------------------------------------------------------
if [ "${1:-}" = "--reset" ]; then
  # -rf, not -f: the lock is a DIRECTORY (mkdir at line 121 - it is the atomic
  # test-and-set that a plain file cannot give). A power cut on 2026-08-24 left one
  # behind and --reset could not clear it, which is the one job --reset exists for.
  rm -f "$SIG" "$CNT"; rm -rf "$LOCK"
  echo "breaker reset - the build gate blocks again."
  exit 0
fi

# --- read the event ---------------------------------------------------------
payload=$(cat)
read_json() {
  printf '%s' "$payload" | node -e '
    const k=process.argv[1];let s="";
    process.stdin.on("data",d=>s+=d).on("end",()=>{
      try{const j=JSON.parse(s);
        const v = k==="event" ? j.hook_event_name
                : (j.tool_input&&j.tool_input.file_path)||"";
        process.stdout.write(String(v||""));
      }catch(e){process.stdout.write("");}
    });' "$1" 2>/dev/null
}

event=$(read_json event)
file=$(read_json file)

# Only the Stop gate blocks. PostToolUse reports and steps aside.
blocking=1
[ "$event" = "PostToolUse" ] && blocking=0

# say() sends a message where the model will actually see it for this event
say() { if [ "$blocking" -eq 1 ]; then printf '%s\n' "$*" >&2; else printf '%s\n' "$*"; fi; }
verdict() { [ "$blocking" -eq 1 ] && exit 2; exit 0; }

# --- is this edit one we care about? ---------------------------------------
is_our_source() {
  local f norm
  f="$1"
  case "$f" in *.cpp|*.h|*.cs) ;; *) return 1 ;; esac
  norm=$(printf '%s' "$f" | tr '\\' '/')
  case "$norm" in
    *<project>/Source/*|*<project>/Plugins/*) return 0 ;;
    *) return 1 ;;
  esac
}

# --- has anything been touched since the last good build? -------------------
source_changed() {
  [ -f "$STAMP" ] || return 0
  local hit
  hit=$(find "${SRC_DIRS[@]}" \
          \( -name '*.cpp' -o -name '*.h' -o -name '*.cs' \) \
          -newer "$STAMP" -print -quit 2>/dev/null)
  [ -n "$hit" ]
}

# --- has any UI source been touched since the last good build? --------------
# 🔴 THE GATE USED TO BE DEAF TO THIS ENTIRELY.
#
# check-boundary.js guards the most dangerous line in the project - a command name shared
# between C++ and JS, which the compiler cannot see either half of. It only ever ran after
# a C++ build. So renaming a command in JS ALONE reached Stop, matched no *.cpp, and exited
# 0: the one edit the check exists for was the one edit that skipped it.
#
# A UI edit needs no build. It needs the boundary check, and that costs a second.
ui_changed() {
  [ -f "$STAMP" ] || return 0
  local hit
  hit=$(find "$ROOT/UI" \
          \( -name '*.js' -o -name '*.html' \) \
          -newer "$STAMP" -print -quit 2>/dev/null)
  [ -n "$hit" ]
}

case "$event" in
  PostToolUse)
    is_our_source "$file" || exit 0
    ;;
  Stop|SubagentStop)
    if source_changed; then
      : # C++ moved: the full path below - build, count, checks, tests
    elif ui_changed; then
      # No C++ moved, so there is nothing to compile and nothing to re-test. Run the
      # checks that read source rather than binaries, and stop there.
      problems=0
      note() { say "$*"; problems=$((problems + 1)); }
      bnd=$(node "$HOOKDIR/check-boundary.js" 2>&1) || note "$bnd"
      if ui=$(node "$HOOKDIR/test-ui.js" 2>&1); then say "$ui"; else note "$ui"; fi
      if [ "$problems" -ne 0 ]; then verdict; fi
      say "UI changed, no C++ did: boundary holds, nothing to build."
      exit 0
    else
      exit 0
    fi
    ;;
  *)
    # unknown event: fall back to the file check so nothing runs by accident
    is_our_source "$file" || exit 0
    ;;
esac

# --- breaker open? then get out of the way ---------------------------------
fails=0
[ -f "$CNT" ] && fails=$(cat "$CNT" 2>/dev/null || echo 0)
if [ "$fails" -ge "$MAX_FAIL" ]; then
  echo "build gate is OPEN - the same failure repeated $fails times, so it stopped blocking." >&2
  echo "Nothing is being verified until a human looks at $LOG" >&2
  echo "Reset with: bash '$HOOKDIR/verify-build.sh' --reset" >&2
  exit 0
fi

# --- one build at a time ----------------------------------------------------
# 🔴 THIS USED TO BE A THIRD WAY TO PASS WITHOUT VERIFYING ANYTHING.
#
# It was `mkdir || exit 0`. Two holes in that:
#   1. A Stop firing while a PostToolUse build held the lock exited 0 - green, with no
#      build of its own and no idea what the other one would conclude.
#   2. The trap does not survive a hard kill at the 600s hook timeout. One of those left
#      a lock DIRECTORY behind, and from then on every run exited 0, permanently, silently.
#
# So: a report steps aside (it will be re-run by the next edit anyway), a Stop WAITS, and a
# lock older than the hook timeout is treated as abandoned rather than obeyed forever.
LOCK_STALE_SECS=900          # 600s hook timeout plus slack

if [ -d "$LOCK" ]; then
  lock_age=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
  if [ "$lock_age" -gt "$LOCK_STALE_SECS" ]; then
    say "Clearing a build lock abandoned ${lock_age}s ago - nothing can have held it that long."
    rmdir "$LOCK" 2>/dev/null || rm -rf "$LOCK"
  fi
fi

if ! mkdir "$LOCK" 2>/dev/null; then
  if [ "$blocking" -eq 0 ]; then
    exit 0                   # a report: the other hook is already building the same tree
  fi
  # A Stop must not pass on someone else's build. Wait for the lock, then take it.
  waited=0
  while ! mkdir "$LOCK" 2>/dev/null; do
    sleep 5; waited=$((waited + 5))
    if [ "$waited" -ge "$LOCK_STALE_SECS" ]; then
      say "BUILD LOCK HELD for ${waited}s and never released. Nothing has been verified."
      say "Check for a stuck build, then: rm -rf '$LOCK'"
      exit 2
    fi
  done
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# --- build ------------------------------------------------------------------
powershell -NoProfile -NonInteractive -Command \
  "& '$ENGINE' ProjectEditor Win64 Development -Project='$UPROJECT' -WaitMutex -FromMsBuild" \
  > "$LOG" 2>&1

if grep -q "Result: Succeeded" "$LOG"; then

  # 🔴 EVERY CHECK RUNS, THEN ONE VERDICT. It used to be a chain of early exits, and the
  # first one to fail hid every check behind it. On 2026-09-15 that was not theoretical: the
  # reflection count was 311 out of date, so it returned at the count and check-architecture,
  # check-boundary, check-unity and check-purity had not run in fifteen days - two of which
  # were red the whole time. A gate that reports one fault out of four teaches you to fix one
  # fault out of four.
  problems=0
  note() { say "$*"; problems=$((problems + 1)); }

  # --- the blueprint contract, PER MODULE ------------------------------------
  # One number for the whole tree says only THAT it moved, never WHICH module moved, and the
  # ledger at the top of this file died of exactly that. Per module, a drift names itself.
  count_macros() {
    find "$1" -name '*.h' -exec grep -hE '^[[:space:]]*(UFUNCTION|UPROPERTY)' {} + 2>/dev/null \
      | wc -l | tr -d ' '
  }
  check_module() {
    local name="$1" dir="$2" base="$3" now
    [ -d "$dir" ] || return 0
    now=$(count_macros "$dir")
    [ "$now" -eq "$base" ] && return 0
    note "BLUEPRINT CONTRACT MOVED in $name: $now, baseline $base ($(( now - base )))."
    note "  Assets bind to UFUNCTION and UPROPERTY by NAME and the compiler cannot see that"
    note "  link. Confirm the change was intended, then record the arithmetic beside"
    note "  BASELINE_$name in this file - the number, and what accounts for it."
  }
  check_module PRJ        "$ROOT/Project/Source/PRJ"                 "$BASELINE_PRJ"
  check_module SELL      "$ROOT/Project/Source/SELL"               "$BASELINE_SELL"
  check_module LAUNCHGATE "$ROOT/Project/Source/PRJLaunchGate"       "$BASELINE_LAUNCHGATE"
  check_module HTMLUI     "$ROOT/Project/Plugins/HtmlUI/Source"      "$BASELINE_HTMLUI"

  # --- the four static checks ------------------------------------------------
  # The dependency rule. Clean Architecture ch.24 says a source-level boundary inside one
  # module survives on discipline alone, so it is checked here rather than written down and
  # hoped for. Same reason as the count above: the compiler is happy either way.
  arch=$(node "$HOOKDIR/check-architecture.js" 2>&1) || note "$arch"

  # The C++ <-> JS boundary. The most dangerous line in the project and the one the compiler
  # is blindest to: rename a command on one side and the build stays green while the product
  # goes deaf.
  bnd=$(node "$HOOKDIR/check-boundary.js" 2>&1) || note "$bnd"

  # One definition per name. A file-local helper copied into two files is legal apart and a
  # redefinition once UnrealBuildTool puts both in one unity blob - so this build passing is
  # no promise about the next one.
  uni=$(node "$HOOKDIR/check-unity.js" 2>&1) || note "$uni"

  # The inner rings compile without the framework. An #include of Engine/DataTable.h inside
  # Domain/ is perfectly legal C++; it is the ARCHITECTURE it breaks, and nothing else in
  # this pipeline can see that.
  pur=$(node "$HOOKDIR/check-purity.js" 2>&1) || note "$pur"

  # One idea, one place. check-unity.js above refuses the same file-scope helper in two
  # .cpp files because the LINKER eventually will; this refuses the same method name on
  # two classes in different folders, which the linker is perfectly happy with. It was
  # written on 2026-09-15 after check-unity reported green while EvaluateCurveAlpha stood
  # in three folders with two different curves behind one dropdown label.
  dup=$(node "$HOOKDIR/check-duplication.js" 2>&1) || note "$dup"

  # The web layer under test - Escape arbitration and the transport contract. It had no
  # tests of any kind until 2026-09-15 while the C++ had 43, and both faults found that
  # day were plain logic over a keydown and a callback. No browser was ever the reason.
  if uit=$(node "$HOOKDIR/test-ui.js" 2>&1); then say "$uit"; else note "$uit"; fi

  # --- the tests -------------------------------------------------------------
  # 🔴 THE GATE USED TO COMPILE THESE AND NEVER RUN ONE.
  #
  # Thirty-six automation cases existed, every one of them able to fail, and the only command
  # that ran them lived in a COMMENT at PRJWebUICommandsTest.cpp:21. The gate checked
  # "Result: Succeeded", which is a compile result: a test that failed to BUILD turned it red,
  # and a test that FAILED did not, and never had. Every "🔴 this failed on its first run"
  # note in those files records a human running that comment by hand.
  #
  # Only the Stop gate runs them. It costs about thirty seconds of editor startup and that is
  # too long to pay after every single edit, which is what PostToolUse is.
  if [ "$blocking" -eq 1 ]; then
    if [ ! -x "$EDITOR_CMD" ] && [ ! -f "$EDITOR_CMD" ]; then
      note "TESTS NOT RUN: no editor at $EDITOR_CMD (EngineAssociation says $ENGINE_VER)."
    else
      # PRJ+SELL, not PRJ. SELL had no tests at all until 2026-09-22, so the filter
      # that named one module was harmless and became wrong the moment a second module
      # grew one: the case would build, sit in the binary, and never run - the worst
      # kind of test, because the roster below cannot miss what the filter never asked for.
      "$EDITOR_CMD" "$UPROJECT" \
        -ExecCmds="Automation RunTests PRJ+SELL; Quit" \
        -unattended -nop4 -nosplash -nullrhi -log -abslog="$TESTLOG" > /dev/null 2>&1
      # grep -c always prints a number and exits 1 when that number is zero, so the old
      # fallback appended a SECOND line and the test below was handed two zeroes, not one.
      # Take the number; ignore the status.
      ran=$(grep -c 'Test Completed' "$TESTLOG" 2>/dev/null); ran=${ran:-0}
      bad=$(grep -c 'Result={Fail}' "$TESTLOG" 2>/dev/null); bad=${bad:-0}
      if [ "$ran" -eq 0 ]; then
        note "TESTS DID NOT RUN - the editor started and reported no case at all."
        note "  That is not a pass. Check $TESTLOG"
      elif [ "$bad" -ne 0 ]; then
        note "$bad of $ran TESTS FAILED:"
        grep 'Result={Fail}' "$TESTLOG" | sed 's/.*Path={/  /;s/}.*//' \
          | while IFS= read -r t; do note "$t"; done
        note "  Full log: $TESTLOG"
      else
        say "$ran tests ran, all passed."
      fi
      # A count that holds still is not proof nothing went missing - see test-roster.js.
      if [ "$ran" -ne 0 ]; then
        if roster=$(node "$HOOKDIR/test-roster.js" "$TESTLOG" 2>&1); then say "$roster"; else note "$roster"; fi
      fi
    fi
  fi

  if [ "$problems" -ne 0 ]; then
    verdict
  fi

  # --- the report that is not a gate -----------------------------------------
  # I and A and D, measured. This is a REPORT and exits 0 whatever it finds: a number
  # moving the wrong way can be the honest price of a change, and a check that failed on
  # it would only teach people to stop looking.
  #
  # 🔴 IT WAS NEVER INVOKED BY ANYTHING. Written, maintained, commented at length, and
  # called from no hook and no script - so the one file that could have said Interaction
  # sits at D=1.000 was printing to nobody. Only on a green Stop, so it reads a tree that
  # actually compiles.
  if [ "$blocking" -eq 1 ]; then
    say ""
    node "$HOOKDIR/metrics.js" 2>&1 | while IFS= read -r l; do say "$l"; done
  fi
  # green: clear the failure history and stamp the tree
  rm -f "$SIG" "$CNT"
  : > "$STAMP"
  exit 0
fi

# --- it did not succeed. WHY it did not succeed decides everything below --------
outcome=$(classify_build "$LOG")

if [ "$outcome" = "BLOCKED" ]; then
  # 🔴 THE BUILD NEVER RAN. This still blocks - nothing was verified, and saying "fine"
  # here would be the same lie the breaker told for fifteen days - but it does NOT touch
  # the failure counter. See build-outcome.sh for the 2026-08-31 incident this is from.
  say "BUILD COULD NOT RUN${file:+ after editing $file} - this is not a code failure."
  grep -iE 'Live Coding|mutex|being used by another process|ERROR:|Result:' "$LOG" \
    | tail -6 | while IFS= read -r l; do say "$l"; done
  say ""
  say "Close the Unreal editor and any running build, then let the gate try again."
  say "Nothing has been counted against the breaker: a lockout has no fix in the code,"
  say "and retrying after closing the editor is exactly the right move."
  say "Full log: $LOG"
  exit 2
fi

# --- a real compile failure -------------------------------------------------
say "BUILD FAILED${file:+ after editing $file}"
grep -iE 'error|Result:' "$LOG" | tail -20 | while IFS= read -r l; do say "$l"; done
say "Full log: $LOG"

# A report does not count toward the breaker. Only the Stop gate does - a
# mid-refactor red tree is expected, and counting it was what tripped the
# breaker on work that was going fine.
[ "$blocking" -eq 1 ] || exit 0

# --- is it the same failure as last time? -----------------------------------
sig=$(build_signature "$LOG")
prev=""
[ -f "$SIG" ] && prev=$(cat "$SIG" 2>/dev/null)

if [ "$sig" = "$prev" ]; then
  fails=$((fails + 1))
else
  fails=1
  printf '%s' "$sig" > "$SIG"
fi
echo "$fails" > "$CNT"

if [ "$fails" -ge "$MAX_FAIL" ]; then
  say ""
  say "STOP. The same failure blocked twice: $sig"
  say "Do not try a third fix. The gate is now open and will not block again."
  say "Report it to the project owner and wait. After it is fixed: verify-build.sh --reset"
fi

exit 2
