import type { Preview } from "@storybook/react-vite";
// import {
//   Title,
//   Subtitle,
//   Description,
//   Primary,
//   Controls,
//   Stories,
// } from "@storybook/addon-docs/blocks";

const preview: Preview = {
  parameters: {
    docs: {
      // canvas: {
      //   sourceState: "shown",
      // },
      codePanel: true,
      toc: true,
      // page: () => (
      //   <>
      //     <Title />
      //     <Subtitle />
      //     <Description />
      //     {/* <Primary /> */}
      //     {/* <Controls /> */}
      //     <Stories />
      //   </>
      // ),
    },
  },
};

export default preview;
