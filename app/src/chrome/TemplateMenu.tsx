import { useEffect, useRef } from "react";
import { BoardIdSchema } from "@aegis/domain";
import type { FeatureContext } from "../composition.js";
import { createMenu } from "../lib/ui/menu.js";
import { frameworks, starters, templateCommands } from "./templates.js";
import type { LibraryService } from "./library-model.js";
import { submit } from "./actions.js";
import type { Notify } from "./actions.js";

export function Templates({
  context,
  library,
  notify,
  hidden = false,
}: {
  readonly context: FeatureContext;
  readonly library: LibraryService;
  readonly notify: Notify;
  readonly hidden?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!trigger.current) return;
    const element = document.createElement("div");
    element.className = "ctx-menu";
    const menu = createMenu({
      trigger: trigger.current,
      menu: element,
      label: "Templates",
      items: () => [
        ...Object.entries(frameworks).map(([key, framework]) => ({
          title: framework.name,
          section: "Add to this board",
          run: () => {
            const commands = templateCommands(
              key,
              context.workspace.scene.snapshot(),
            );
            if (submit(context, commands, notify)) {
              const ids = commands.flatMap((command) =>
                command.op === "create" && command.newId ? [command.newId] : [],
              );
              context.workspace.act({ kind: "select", ids });
              context.engine()?.navigate({ kind: "fit", ids, motion: "glide" });
            }
          },
        })),
        ...Object.keys(starters).map((key) => ({
          title: key,
          section: "Start a new board",
          run: () => {
            void (async () => {
              try {
                const id = BoardIdSchema.parse(
                  await library.create("board", null),
                );
                if (context.workspace.metadata.getSnapshot().id !== id) return;
                const board = library.source
                  .getSnapshot()
                  .boards.find((item) => item.id === id);
                if (!board)
                  throw new Error("The new board was not found in Library.");
                if (
                  submit(
                    context,
                    templateCommands(key, context.workspace.scene.snapshot()),
                    notify,
                  )
                ) {
                  await library.rename({ ...board, item: "board" }, key);
                  if (context.workspace.metadata.getSnapshot().id !== id) return;
                  context
                    .engine()
                    ?.navigate({ kind: "fit", ids: [], motion: "glide" });
                }
              } catch (cause) {
                notify({
                  text:
                    cause instanceof Error
                      ? cause.message
                      : "Could not create the starter board.",
                });
              }
            })();
          },
        })),
      ],
      onToggle: (opened) => {
        if (!opened) return;
        const heading = (text: string) => {
          const node = document.createElement("div");
          node.className = "template-menu-heading";
          node.textContent = text;
          return node;
        };
        element.prepend(heading("Add to this board"));
        element.querySelector(".ctx-sep")?.after(heading("Start a new board"));
      },
    });
    return () => menu.destroy();
  }, [context, library, notify]);
  return (
    <button
      ref={trigger}
      type="button"
      data-tool="templates"
      title="Templates"
      hidden={hidden}
    >
      Templates
    </button>
  );
}
