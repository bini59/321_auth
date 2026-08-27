const graphify = "/home/ubuntu/.local/bin/graphify"

export const GraphifyHook = async ({ directory }) => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool !== "bash") return
    const file = Bun.file(graphify)
    if (!(await file.exists())) return
    const proc = Bun.spawn([graphify, "hook-check"], {
      cwd: directory,
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
    })
    proc.stdin.write(
      JSON.stringify({
        cwd: directory,
        tool_name: "Bash",
        tool_input: output.args || {},
      }),
    )
    proc.stdin.end()
    if ((await proc.exited) !== 0) {
      throw new Error("graphify hook-check blocked the operation")
    }
  },
})
