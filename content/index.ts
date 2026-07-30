import { lessonOne } from "./lesson-01";
import { lessonTwo } from "./lesson-02";
import { lessonThree } from "./lesson-03";
import { lessonFour } from "./lesson-04";
import { lessonFive } from "./lesson-05";
import { lessonSix } from "./lesson-06";
import { lessonSeven } from "./lesson-07";
import { lessonEight } from "./lesson-08";
import { lessonNine } from "./lesson-09";
import { lessonTen } from "./lesson-10";
import { lessonEleven } from "./lesson-11";
import { lessonTwelve } from "./lesson-12";
import { lessonThirteen } from "./lesson-13";
import { lessonFourteen } from "./lesson-14";
import { lessonFifteen } from "./lesson-15";
import { lessonSixteen } from "./lesson-16";
import { lessonSeventeen } from "./lesson-17";
import { lessonEighteen } from "./lesson-18";
import { lessonNineteen } from "./lesson-19";
import { lessonTwenty } from "./lesson-20";
import { lessonTwentyOne } from "./lesson-21";
import { lessonTwentyTwo } from "./lesson-22";
import { lessonTwentyThree } from "./lesson-23";
import { lessonTwentyFour } from "./lesson-24";
import { lessonTwentyFive } from "./lesson-25";
import { lessonTwentySix } from "./lesson-26";
import { lessonTwentySeven } from "./lesson-27";
import { lessonTwentyEight } from "./lesson-28";
import { lessonTwentyNine } from "./lesson-29";
import { lessonThirty } from "./lesson-30";
import { lessonThirtyOne } from "./lesson-31";
import { lessonThirtyTwo } from "./lesson-32";
import { lessonThirtyThree } from "./lesson-33";
import { lessonThirtyFour } from "./lesson-34";
import { lessonThirtyFive } from "./lesson-35";
import { lessonThirtySix } from "./lesson-36";
import { lessonThirtySeven } from "./lesson-37";
import { lessonThirtyEight } from "./lesson-38";
import { lessonThirtyNine } from "./lesson-39";
import { lessonForty } from "./lesson-40";
import { lessonFortyOne } from "./lesson-41";
import { lessonFortyTwo } from "./lesson-42";
import { lessonFortyThree } from "./lesson-43";
import { lessonFortyFour } from "./lesson-44";
import { lessonFortyFive } from "./lesson-45";
import { lessonFortySix } from "./lesson-46";
import { lessonFortySeven } from "./lesson-47";
import { lessonFortyEight } from "./lesson-48";
import { lessonFortyNine } from "./lesson-49";
import { lessonFifty } from "./lesson-50";
import { lessonFiftyOne } from "./lesson-51";
import { lessonFiftyTwo } from "./lesson-52";
import { lessonFiftyThree } from "./lesson-53";
import { lessonFiftyFour } from "./lesson-54";
import { lessonFiftyFive } from "./lesson-55";
import { lessonFiftySix } from "./lesson-56";
import { lessonFiftySeven } from "./lesson-57";
import { lessonFiftyEight } from "./lesson-58";
import { lessonFiftyNine } from "./lesson-59";
import { lessonSixty } from "./lesson-60";
import { lessonSixtyOne } from "./lesson-61";
import { lessonSixtyTwo } from "./lesson-62";
import { lessonSixtyThree } from "./lesson-63";
import { lessonSixtyFour } from "./lesson-64";
import { lessonSixtyFive } from "./lesson-65";
import { lessonSixtySix } from "./lesson-66";
import { lessonSixtySeven } from "./lesson-67";
import { lessonSixtyEight } from "./lesson-68";
import { lessonSixtyNine } from "./lesson-69";
import { lessonSeventy } from "./lesson-70";
import { lessonSeventyOne } from "./lesson-71";
import { lessonSeventyTwo } from "./lesson-72";
import { lessonSeventyThree } from "./lesson-73";
import { lessonSeventyFour } from "./lesson-74";
import { lessonSeventyFive } from "./lesson-75";
import { lessonSeventySix } from "./lesson-76";
import { lessonSeventySeven } from "./lesson-77";
import { lessonSeventyEight } from "./lesson-78";
import { lessonSeventyNine } from "./lesson-79";
import { lessonEighty } from "./lesson-80";
import { lessonEightyOne } from "./lesson-81";
import { lessonEightyTwo } from "./lesson-82";
import { lessonEightyThree } from "./lesson-83";
import { lessonEightyFour } from "./lesson-84";
import { lessonEightyFive } from "./lesson-85";

export type { Lesson, Question, Word } from "./types";

export const rawLessons = [
  lessonOne,
  lessonTwo,
  lessonThree,
  lessonFour,
  lessonFive,
  lessonSix,
  lessonSeven,
  lessonEight,
  lessonNine,
  lessonTen,
  lessonEleven,
  lessonTwelve,
  lessonThirteen,
  lessonFourteen,
  lessonFifteen,
  lessonSixteen,
  lessonSeventeen,
  lessonEighteen,
  lessonNineteen,
  lessonTwenty,
  lessonTwentyOne,
  lessonTwentyTwo,
  lessonTwentyThree,
  lessonTwentyFour,
  lessonTwentyFive,
  lessonTwentySix,
  lessonTwentySeven,
  lessonTwentyEight,
  lessonTwentyNine,
  lessonThirty,
  lessonThirtyOne,
  lessonThirtyTwo,
  lessonThirtyThree,
  lessonThirtyFour,
  lessonThirtyFive,
  lessonThirtySix,
  lessonThirtySeven,
  lessonThirtyEight,
  lessonThirtyNine,
  lessonForty,
  lessonFortyOne,
  lessonFortyTwo,
  lessonFortyThree,
  lessonFortyFour,
  lessonFortyFive,
  lessonFortySix,
  lessonFortySeven,
  lessonFortyEight,
  lessonFortyNine,
  lessonFifty,
  lessonFiftyOne,
  lessonFiftyTwo,
  lessonFiftyThree,
  lessonFiftyFour,
  lessonFiftyFive,
  lessonFiftySix,
  lessonFiftySeven,
  lessonFiftyEight,
  lessonFiftyNine,
  lessonSixty,
  lessonSixtyOne,
  lessonSixtyTwo,
  lessonSixtyThree,
  lessonSixtyFour,
  lessonSixtyFive,
  lessonSixtySix,
  lessonSixtySeven,
  lessonSixtyEight,
  lessonSixtyNine,
  lessonSeventy,
  lessonSeventyOne,
  lessonSeventyTwo,
  lessonSeventyThree,
  lessonSeventyFour,
  lessonSeventyFive,
  lessonSeventySix,
  lessonSeventySeven,
  lessonSeventyEight,
  lessonSeventyNine,
  lessonEighty,
  lessonEightyOne,
  lessonEightyTwo,
  lessonEightyThree,
  lessonEightyFour,
  lessonEightyFive,
];
