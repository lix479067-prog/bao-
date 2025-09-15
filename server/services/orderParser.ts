/**
 * Order text parsing service - extracts customer, project, and amount information
 * from employee submitted templates using precise colon-based matching
 */

export interface ParseResult {
  customerName: string | null;
  projectName: string | null;
  amountExtracted: string | null;
  extractionStatus: 'success' | 'failed' | 'pending';
}

export class OrderParser {
  /**
   * Parse text content to extract customer, project, and amount information
   * Uses precise colon matching and order type specific amount fields
   */
  static parseOrderContent(text: string, orderType?: 'deposit' | 'withdrawal' | 'refund'): ParseResult {
    if (!text || typeof text !== 'string') {
      return {
        customerName: null,
        projectName: null,
        amountExtracted: null,
        extractionStatus: 'failed'
      };
    }

    const result: ParseResult = {
      customerName: null,
      projectName: null,
      amountExtracted: null,
      extractionStatus: 'pending'
    };

    try {
      // Customer name extraction - precise colon matching
      // Matches: 客户：张三, 客户名：李四, Customer: John Smith, customer: jane, 客户姓名：王五
      const customerPatterns = [
        /(?:客户|客户名|客户姓名|Customer|customer|CUSTOMER)[:：]\s*([^\n\r]+?)(?:\n|\r|$)/i,
        /(?:客户|客户名|客户姓名|Customer|customer|CUSTOMER)[:：]\s*(.+?)$/im
      ];
      
      for (const pattern of customerPatterns) {
        const customerMatch = text.match(pattern);
        if (customerMatch && customerMatch[1]) {
          result.customerName = customerMatch[1].trim();
          break;
        }
      }

      // Project name extraction - precise colon matching
      // Matches: 项目：VIP充值, Project: Gaming Platform, 项目名：系统升级, 业务：转账服务
      const projectPatterns = [
        /(?:项目|项目名|Project|project|PROJECT|业务|业务类型|服务)[:：]\s*([^\n\r]+?)(?:\n|\r|$)/i,
        /(?:项目|项目名|Project|project|PROJECT|业务|业务类型|服务)[:：]\s*(.+?)$/im
      ];
      
      for (const pattern of projectPatterns) {
        const projectMatch = text.match(pattern);
        if (projectMatch && projectMatch[1]) {
          result.projectName = projectMatch[1].trim();
          break;
        }
      }

      // Amount extraction - order type specific amount fields
      let amountPatterns: RegExp[];
      
      if (orderType) {
        // Use order type specific patterns for precise matching
        const typeSpecificPatterns = {
          deposit: [
            /入款金额[:：]\s*([0-9]+(?:\.[0-9]+)?)\s*(?:元|USD|$|¥|人民币)?/i,
            /入款金额[:：]\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:元|USD|$|¥|人民币)?/i
          ],
          withdrawal: [
            /出款金额[:：]\s*([0-9]+(?:\.[0-9]+)?)\s*(?:元|USD|$|¥|人民币)?/i,
            /出款金额[:：]\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:元|USD|$|¥|人民币)?/i
          ],
          refund: [
            /退款金额[:：]\s*([0-9]+(?:\.[0-9]+)?)\s*(?:元|USD|$|¥|人民币)?/i,
            /退款金额[:：]\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:元|USD|$|¥|人民币)?/i
          ]
        };
        amountPatterns = typeSpecificPatterns[orderType];
      } else {
        // Fallback to generic patterns for backward compatibility
        amountPatterns = [
          /(?:金额|Amount|amount|AMOUNT|数量|总额|总金额|价格|费用)[:：]\s*([0-9]+(?:\.[0-9]+)?)\s*(?:元|USD|$|¥|人民币)?/i,
          /(?:金额|Amount|amount|AMOUNT|数量|总额|总金额|价格|费用)[:：]\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:元|USD|$|¥|人民币)?/i
        ];
      }
      
      for (const pattern of amountPatterns) {
        const amountMatch = text.match(pattern);
        if (amountMatch && amountMatch[1]) {
          // Remove commas from numbers and validate
          const cleanAmount = amountMatch[1].replace(/,/g, '');
          if (/^\d+(?:\.\d+)?$/.test(cleanAmount)) {
            result.amountExtracted = cleanAmount;
            break;
          }
        }
      }

      // Determine extraction status
      const extractedFields = [
        result.customerName,
        result.projectName,
        result.amountExtracted
      ].filter(field => field !== null);

      if (extractedFields.length === 3) {
        result.extractionStatus = 'success';
      } else if (extractedFields.length > 0) {
        result.extractionStatus = 'success'; // Partial success is still success
      } else {
        result.extractionStatus = 'failed';
      }

      console.log('[OrderParser] Parse result:', {
        order_type: orderType || 'generic',
        input_length: text.length,
        customer_found: !!result.customerName,
        project_found: !!result.projectName,
        amount_found: !!result.amountExtracted,
        status: result.extractionStatus
      });

      return result;

    } catch (error) {
      console.error('[OrderParser] Parsing error:', error);
      return {
        customerName: null,
        projectName: null,
        amountExtracted: null,
        extractionStatus: 'failed'
      };
    }
  }

  /**
   * Extract amount for backward compatibility with existing amount field
   * Falls back to old regex pattern if colon-based extraction fails
   */
  static extractAmount(text: string): string {
    const parseResult = this.parseOrderContent(text);
    
    if (parseResult.amountExtracted) {
      return parseResult.amountExtracted;
    }

    // Fallback to old extraction method for backward compatibility
    const amountMatch = text.match(/(?:金额|amount|Amount|AMOUNT)[:：]\s*(\d+(?:\.\d+)?)/i);
    return amountMatch ? amountMatch[1] : '0';
  }

  /**
   * Validate that extracted data makes sense
   */
  static validateParseResult(result: ParseResult): boolean {
    // Basic validation rules
    if (result.customerName && result.customerName.length > 100) {
      return false; // Customer name too long
    }
    
    if (result.projectName && result.projectName.length > 200) {
      return false; // Project name too long
    }
    
    if (result.amountExtracted) {
      const amount = parseFloat(result.amountExtracted);
      if (isNaN(amount) || amount < 0 || amount > 999999999) {
        return false; // Invalid amount
      }
    }
    
    return true;
  }
}