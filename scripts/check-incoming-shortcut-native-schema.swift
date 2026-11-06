// macOS diagnostic for generated, secret-free incoming workflows only.
// Reads ActionKit's shipped action definitions, never installed shortcuts or
// their storage. No action runs, network calls or user files are involved.
// The synthetic Count primitive runs on fixed strings to check its unit values.
// Usage: xcrun swift scripts/check-incoming-shortcut-native-schema.swift file.wflow
import Foundation
import ObjectiveC
import Darwin

func check(_ ok: Bool, _ message: String) {
    if !ok { fputs(message + "\n", stderr); exit(1) }
}
func call0(_ object: AnyObject, _ name: String) -> NSObject? {
    let selector = NSSelectorFromString(name)
    typealias Function = @convention(c) (AnyObject, Selector) -> Unmanaged<AnyObject>?
    let function = unsafeBitCast(class_getMethodImplementation(object_getClass(object), selector), to: Function.self)
    return function(object, selector)?.takeUnretainedValue() as? NSObject
}
check(CommandLine.arguments.count == 2, "Pass a generated secret-free .wflow")
for framework in ["WorkflowKit", "ActionKit"] {
    check(dlopen("/System/Library/PrivateFrameworks/\(framework).framework/\(framework)", RTLD_LAZY) != nil, "Cannot load native action definitions")
}
guard let registryClass = NSClassFromString("WFActionRegistry"),
      let registry = call0(registryClass as AnyObject, "toolKitRegistry") else { fatalError("Native action registry unavailable") }
registry.perform(NSSelectorFromString("fill"))
let createSelector = NSSelectorFromString("createActionWithIdentifier:serializedParameters:")
typealias Create = @convention(c) (AnyObject, Selector, NSString, NSDictionary) -> Unmanaged<AnyObject>?
let create = unsafeBitCast(class_getMethodImplementation(object_getClass(registry), createSelector), to: Create.self)
func action(_ identifier: String, _ parameters: NSDictionary) -> NSObject {
    guard let result = create(registry, createSelector, identifier as NSString, parameters)?.takeUnretainedValue() as? NSObject else { fatalError("Missing native action") }
    return result
}
func keys(_ action: NSObject) -> Set<String> {
    let definitions = action.value(forKey: "parameterDefinitions") as? [NSObject] ?? []
    return Set(definitions.compactMap { $0.perform(NSSelectorFromString("objectForKey:"), with: "Key")?.takeUnretainedValue() as? String })
}
let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let workflow = try PropertyListSerialization.propertyList(from: data, format: nil) as! [String: Any]
let actions = workflow["WFWorkflowActions"] as! [[String: Any]]
let controlKeys: Set<String> = ["UUID", "GroupingIdentifier", "WFControlFlowMode"]
var checked = 0
for item in actions {
    let identifier = item["WFWorkflowActionIdentifier"] as! String
    let parameters = item["WFWorkflowActionParameters"] as! [String: Any]
    // The shipped conditional definition exposes WFConditions only; existing
    // native acceptance covers this workflow's legacy single-condition form.
    if identifier == "is.workflow.actions.conditional" { continue }
    let native = action(identifier, parameters as NSDictionary)
    let declared = keys(native)
    check(String(cString: class_getName(object_getClass(native)!)) != "WFMissingAction", "Unavailable native definition: \(identifier)")
    let unknown = Set(parameters.keys).subtracting(declared).subtracting(controlKeys)
    check(unknown.isEmpty, "Unknown native parameters in \(identifier): \(unknown.sorted())")
    checked += 1
}
let count = action("is.workflow.actions.count", ["WFCountType": "Characters"])
check(keys(count).contains("Input") && !keys(count).contains("WFInput"), "Count input schema changed")
let countSelector = NSSelectorFromString("performCountingOnString:withCountType:")
check(count.responds(to: countSelector), "Native synthetic count primitive unavailable")
typealias Count = @convention(c) (AnyObject, Selector, NSString, NSString) -> UInt
let nativeCount = unsafeBitCast(class_getMethodImplementation(object_getClass(count), countSelector), to: Count.self)
for (value, expected) in [("", 0), (String(repeating: "x", count: 43), 43), (String(repeating: "a", count: 36), 36)] {
    check(nativeCount(count, countSelector, value as NSString, "Characters") == UInt(expected), "Native character counting failed on synthetic text")
}
print("Native parameter schema passed for \(checked) actions; 3 synthetic character counts passed. Workflow execution remains unverified.")
