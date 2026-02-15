/*
 * Copyright (c) 2024 Themba Mzumara
 * TypeScript Syntax Stripper Transformer
 * Removes TypeScript-only syntax that doesn't exist at runtime
 */

import * as ts from "typescript";

/**
 * Helper to check if a modifier is an access modifier or readonly
 */
function isAccessModifierOrReadonly(mod: ts.ModifierLike): boolean {
  return (
    mod.kind === ts.SyntaxKind.PrivateKeyword ||
    mod.kind === ts.SyntaxKind.PublicKeyword ||
    mod.kind === ts.SyntaxKind.ProtectedKeyword ||
    mod.kind === ts.SyntaxKind.ReadonlyKeyword
  );
}

/**
 * Helper to strip type annotations from parameters
 */
function stripParameterTypes(
  params: ts.NodeArray<ts.ParameterDeclaration>,
  factory: ts.NodeFactory,
  visitor: (node: ts.Node) => ts.Node | undefined,
): ts.NodeArray<ts.ParameterDeclaration> {
  return factory.createNodeArray(
    params.map((param) => {
      const filteredModifiers = param.modifiers?.filter(
        (mod) => !isAccessModifierOrReadonly(mod),
      );

      return factory.updateParameterDeclaration(
        param,
        filteredModifiers,
        param.dotDotDotToken,
        param.name,
        undefined, // Remove question token
        undefined, // Remove type annotation
        param.initializer
          ? (ts.visitNode(param.initializer, visitor) as ts.Expression)
          : undefined,
      );
    }),
  );
}

/**
 * Transformer that strips TypeScript-only syntax from the AST:
 * - import type statements
 * - interface declarations
 * - type alias declarations
 * - type annotations from class properties
 * - access modifiers (private, public, protected, readonly)
 */
export function typeSyntaxStripperTransformer(): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => {
    const factory = context.factory;

    const visitor = (node: ts.Node): ts.Node | undefined => {
      // Remove type-only imports (import type { ... })
      if (ts.isImportDeclaration(node)) {
        if (node.importClause?.isTypeOnly) {
          return undefined; // Remove the entire import
        }
      }

      // Remove interface declarations
      if (ts.isInterfaceDeclaration(node)) {
        return undefined;
      }

      // Remove type alias declarations
      if (ts.isTypeAliasDeclaration(node)) {
        return undefined;
      }

      // Strip type annotations and access modifiers from class properties
      if (ts.isPropertyDeclaration(node)) {
        // If property has no initializer and only type annotation, remove it entirely
        if (!node.initializer && node.type) {
          return undefined;
        }

        // If property has initializer, keep it but remove type annotation AND access modifiers
        const filteredModifiers = node.modifiers?.filter(
          (mod) => !isAccessModifierOrReadonly(mod),
        );

        return factory.updatePropertyDeclaration(
          node,
          filteredModifiers,
          node.name,
          undefined, // Remove question token
          undefined, // Remove type annotation
          node.initializer
            ? (ts.visitNode(node.initializer, visitor) as ts.Expression)
            : undefined,
        );
      }

      // Strip type annotations from constructor parameters
      if (ts.isConstructorDeclaration(node)) {
        const strippedParams = stripParameterTypes(
          node.parameters,
          factory,
          visitor,
        );

        return factory.updateConstructorDeclaration(
          node,
          node.modifiers,
          strippedParams, // Use stripped parameters
          node.body ? (ts.visitNode(node.body, visitor) as ts.Block) : undefined,
        );
      }

      // Strip return type annotations and access modifiers from methods
      if (ts.isMethodDeclaration(node)) {
        const filteredModifiers = node.modifiers?.filter(
          (mod) => !isAccessModifierOrReadonly(mod),
        );

        // Strip types from parameters
        const strippedParams = stripParameterTypes(
          node.parameters,
          factory,
          visitor,
        );

        return factory.updateMethodDeclaration(
          node,
          filteredModifiers,
          node.asteriskToken,
          node.name,
          node.questionToken,
          undefined, // Remove type parameters
          strippedParams, // Use stripped parameters
          undefined, // Remove return type
          node.body ? (ts.visitNode(node.body, visitor) as ts.Block) : undefined,
        );
      }

      // Strip return type from arrow functions
      if (ts.isArrowFunction(node)) {
        const strippedParams = stripParameterTypes(
          node.parameters,
          factory,
          visitor,
        );

        return factory.updateArrowFunction(
          node,
          node.modifiers,
          undefined, // Remove type parameters
          strippedParams, // Use stripped parameters
          undefined, // Remove return type
          node.equalsGreaterThanToken,
          ts.visitNode(node.body, visitor) as ts.ConciseBody,
        );
      }

      // Strip return type from function declarations
      if (ts.isFunctionDeclaration(node)) {
        const strippedParams = stripParameterTypes(
          node.parameters,
          factory,
          visitor,
        );

        return factory.updateFunctionDeclaration(
          node,
          node.modifiers,
          node.asteriskToken,
          node.name,
          undefined, // Remove type parameters
          strippedParams, // Use stripped parameters
          undefined, // Remove return type
          node.body ? (ts.visitNode(node.body, visitor) as ts.Block) : undefined,
        );
      }

      // Strip type annotations from variable declarations
      if (ts.isVariableDeclaration(node)) {
        return factory.updateVariableDeclaration(
          node,
          node.name,
          undefined, // Remove exclamation token
          undefined, // Remove type annotation
          node.initializer
            ? (ts.visitNode(node.initializer, visitor) as ts.Expression)
            : undefined,
        );
      }

      // Remove type assertions (x as Type)
      if (ts.isAsExpression(node)) {
        return ts.visitNode(node.expression, visitor);
      }

      // Remove type assertions (<Type>x)
      if (ts.isTypeAssertionExpression(node)) {
        return ts.visitNode(node.expression, visitor);
      }

      // Recursively visit child nodes
      return ts.visitEachChild(node, visitor, context);
    };

    return (sourceFile: ts.SourceFile) => {
      return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
    };
  };
}
